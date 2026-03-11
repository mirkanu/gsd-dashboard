const { Router } = require("express");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const { stmts, db } = require("../db");
const { broadcast } = require("../websocket");

const router = Router();

/**
 * Parse a Claude Code transcript JSONL file and extract cumulative token usage per model.
 * Returns null if the file can't be read or has no usage data.
 */
function extractTokensFromTranscript(transcriptPath) {
  if (!transcriptPath) return null;
  try {
    if (!fs.existsSync(transcriptPath)) return null;
    const content = fs.readFileSync(transcriptPath, "utf8");
    const tokensByModel = {};
    for (const line of content.split("\n")) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        // Transcript JSONL nests model/usage inside entry.message
        const msg = entry.message || entry;
        const model = msg.model;
        if (!model || model === "<synthetic>" || !msg.usage) continue;
        if (!tokensByModel[model]) {
          tokensByModel[model] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
        }
        tokensByModel[model].input += msg.usage.input_tokens || 0;
        tokensByModel[model].output += msg.usage.output_tokens || 0;
        tokensByModel[model].cacheRead += msg.usage.cache_read_input_tokens || 0;
        tokensByModel[model].cacheWrite += msg.usage.cache_creation_input_tokens || 0;
      } catch {
        continue;
      }
    }
    return Object.keys(tokensByModel).length > 0 ? tokensByModel : null;
  } catch {
    return null;
  }
}

function ensureSession(sessionId, data) {
  let session = stmts.getSession.get(sessionId);
  if (!session) {
    stmts.insertSession.run(
      sessionId,
      data.session_name || `Session ${sessionId.slice(0, 8)}`,
      "active",
      data.cwd || null,
      data.model || null,
      null
    );
    session = stmts.getSession.get(sessionId);
    broadcast("session_created", session);

    // Create main agent for new session
    const mainAgentId = `${sessionId}-main`;
    const sessionLabel = session.name || `Session ${sessionId.slice(0, 8)}`;
    stmts.insertAgent.run(
      mainAgentId,
      sessionId,
      `Main Agent — ${sessionLabel}`,
      "main",
      null,
      "connected",
      null,
      null,
      null
    );
    broadcast("agent_created", stmts.getAgent.get(mainAgentId));
  }
  return session;
}

function getMainAgent(sessionId) {
  return stmts.getAgent.get(`${sessionId}-main`);
}

const processEvent = db.transaction((hookType, data) => {
  const sessionId = data.session_id;
  if (!sessionId) return null;

  const session = ensureSession(sessionId, data);
  let mainAgent = getMainAgent(sessionId);
  const mainAgentId = mainAgent?.id ?? null;

  // Reactivate completed/error/abandoned sessions on new work events (resumed session)
  const endingEvents = ["Stop", "SubagentStop", "SessionEnd"];
  const isWorkEvent = !endingEvents.includes(hookType);
  if (isWorkEvent && session.status !== "active") {
    stmts.reactivateSession.run(sessionId);
    broadcast("session_updated", stmts.getSession.get(sessionId));

    if (mainAgent && mainAgent.status !== "working" && mainAgent.status !== "connected") {
      stmts.reactivateAgent.run(mainAgentId);
      mainAgent = stmts.getAgent.get(mainAgentId);
      broadcast("agent_updated", mainAgent);
    }
  }

  let eventType = hookType;
  let toolName = data.tool_name || null;
  let summary = null;
  let agentId = mainAgentId;

  switch (hookType) {
    case "PreToolUse": {
      summary = `Using tool: ${toolName}`;

      // If the tool is Agent, a subagent is being created
      if (toolName === "Agent") {
        const input = data.tool_input || {};
        const subId = uuidv4();
        // Use description, then type, then first line of prompt, then fallback
        const rawName =
          input.description ||
          input.subagent_type ||
          (input.prompt ? input.prompt.split("\n")[0].slice(0, 60) : null) ||
          "Subagent";
        const subName = rawName.length > 60 ? rawName.slice(0, 57) + "..." : rawName;
        stmts.insertAgent.run(
          subId,
          sessionId,
          subName,
          "subagent",
          input.subagent_type || null,
          "working",
          input.prompt ? input.prompt.slice(0, 500) : null,
          mainAgentId,
          input.metadata ? JSON.stringify(input.metadata) : null
        );
        broadcast("agent_created", stmts.getAgent.get(subId));
        agentId = subId;
        summary = `Subagent spawned: ${subName}`;
      }

      // Update main agent status for any non-terminal state.
      // Skip only if already completed/error (stale event after SessionEnd).
      // "idle" → "working" is the normal transition when a new turn starts after Stop.
      if (
        mainAgent &&
        (mainAgent.status === "working" ||
          mainAgent.status === "connected" ||
          mainAgent.status === "idle")
      ) {
        stmts.updateAgent.run(null, "working", null, toolName, null, null, mainAgentId);
        broadcast("agent_updated", stmts.getAgent.get(mainAgentId));
      }
      break;
    }

    case "PostToolUse": {
      summary = `Tool completed: ${toolName}`;

      // NOTE: PostToolUse for "Agent" tool fires immediately when a subagent is
      // backgrounded — it does NOT mean the subagent finished its work.
      // Subagent completion is handled by SubagentStop, not here.

      // Only clear current_tool on the main agent if it's actively working.
      // Skip if idle (waiting for subagents) or already completed.
      if (mainAgent && mainAgent.status === "working") {
        stmts.updateAgent.run(null, null, null, null, null, null, mainAgentId);
        broadcast("agent_updated", stmts.getAgent.get(mainAgentId));
      }
      break;
    }

    case "Stop": {
      const session = stmts.getSession.get(sessionId);
      const sessionLabel = session?.name || `Session ${sessionId.slice(0, 8)}`;
      summary =
        data.stop_reason === "error"
          ? `Error in ${sessionLabel}`
          : `${sessionLabel} — ready for input`;

      // Stop means Claude finished its turn, NOT that the session is closed.
      // Session stays active — user can still send more messages.
      // Main agent goes to "idle" (waiting for user input).
      // Background subagents may still be running — do NOT complete them here.
      // They complete individually via SubagentStop, or all at once on SessionEnd.
      const now = new Date().toISOString();

      // Set main agent to idle (waiting for user), not completed.
      // For non-tool turns the agent may already be "idle" — still update it
      // so the timestamp and activity log reflect that a turn completed.
      if (mainAgent && mainAgent.status !== "completed" && mainAgent.status !== "error") {
        stmts.updateAgent.run(null, "idle", null, null, null, null, mainAgentId);
        broadcast("agent_updated", stmts.getAgent.get(mainAgentId));
      }

      // Mark error sessions on error stop_reason, but keep normal sessions active
      if (data.stop_reason === "error") {
        stmts.updateSession.run(null, "error", now, null, sessionId);
      }
      broadcast("session_updated", stmts.getSession.get(sessionId));
      break;
    }

    case "SubagentStop": {
      summary = `Subagent completed`;
      const subagents = stmts.listAgentsBySession.all(sessionId);
      let matchingSub = null;

      // Try to identify which subagent stopped using available data.
      // SubagentStop provides: agent_type (e.g. "Explore", "test-engineer"),
      // agent_id (Claude's internal ID), description, last_assistant_message.
      const subDesc = data.description || data.agent_type || data.subagent_type || null;
      if (subDesc) {
        const namePrefix = subDesc.length > 57 ? subDesc.slice(0, 57) : subDesc;
        matchingSub = subagents.find(
          (a) => a.type === "subagent" && a.status === "working" && a.name.startsWith(namePrefix)
        );
      }

      // Try matching by agent_type against stored subagent_type
      if (!matchingSub && data.agent_type) {
        matchingSub = subagents.find(
          (a) =>
            a.type === "subagent" && a.status === "working" && a.subagent_type === data.agent_type
        );
      }

      if (!matchingSub) {
        const prompt = data.prompt ? data.prompt.slice(0, 500) : null;
        if (prompt) {
          matchingSub = subagents.find(
            (a) => a.type === "subagent" && a.status === "working" && a.task === prompt
          );
        }
      }

      // Fallback: oldest working subagent
      if (!matchingSub) {
        matchingSub = subagents.find((a) => a.type === "subagent" && a.status === "working");
      }

      if (matchingSub) {
        stmts.updateAgent.run(
          null,
          "completed",
          null,
          null,
          new Date().toISOString(),
          null,
          matchingSub.id
        );
        broadcast("agent_updated", stmts.getAgent.get(matchingSub.id));
        agentId = matchingSub.id;
        summary = `Subagent completed: ${matchingSub.name}`;

        // Session stays active — SubagentStop just means one subagent finished,
        // the session is not over until the user explicitly closes it.
      }
      break;
    }

    case "SessionStart": {
      summary = data.source === "resume" ? "Session resumed" : "Session started";
      // Reactivation is already handled above for non-active sessions.
      // Set main agent to connected (ready for work).
      if (mainAgent && mainAgent.status === "idle") {
        stmts.updateAgent.run(null, "connected", null, null, null, null, mainAgentId);
        broadcast("agent_updated", stmts.getAgent.get(mainAgentId));
      }

      // Clean up orphaned sessions: when a user runs /resume inside a session,
      // the parent session never receives Stop or SessionEnd. Mark any active
      // session with no events for 5+ minutes as abandoned.
      const staleSessions = stmts.findStaleSessions.all(sessionId, 5);
      const now = new Date().toISOString();
      for (const stale of staleSessions) {
        const staleAgents = stmts.listAgentsBySession.all(stale.id);
        for (const agent of staleAgents) {
          if (agent.status !== "completed" && agent.status !== "error") {
            stmts.updateAgent.run(null, "completed", null, null, now, null, agent.id);
            broadcast("agent_updated", stmts.getAgent.get(agent.id));
          }
        }
        stmts.updateSession.run(null, "abandoned", now, null, stale.id);
        broadcast("session_updated", stmts.getSession.get(stale.id));
      }
      break;
    }

    case "SessionEnd": {
      const endSession = stmts.getSession.get(sessionId);
      const endLabel = endSession?.name || `Session ${sessionId.slice(0, 8)}`;
      summary = `Session closed: ${endLabel}`;

      // SessionEnd is the definitive signal that the CLI process exited.
      // Mark everything as completed.
      const allAgents = stmts.listAgentsBySession.all(sessionId);
      const now = new Date().toISOString();
      for (const agent of allAgents) {
        if (agent.status !== "completed" && agent.status !== "error") {
          stmts.updateAgent.run(null, "completed", null, null, now, null, agent.id);
          broadcast("agent_updated", stmts.getAgent.get(agent.id));
        }
      }
      stmts.updateSession.run(null, "completed", now, null, sessionId);
      broadcast("session_updated", stmts.getSession.get(sessionId));
      break;
    }

    case "Notification": {
      summary = data.message || "Notification received";
      break;
    }

    default: {
      summary = `Event: ${hookType}`;
    }
  }

  // Extract token usage from transcript on every event that provides transcript_path.
  // Claude Code hooks don't include usage/model in stdin — the transcript JSONL is
  // the only reliable source. Using replaceTokenUsage (overwrite, not accumulate)
  // since we compute totals from the full transcript each time.
  if (data.transcript_path) {
    const tokensByModel = extractTokensFromTranscript(data.transcript_path);
    if (tokensByModel) {
      for (const [model, tokens] of Object.entries(tokensByModel)) {
        stmts.replaceTokenUsage.run(
          sessionId,
          model,
          tokens.input,
          tokens.output,
          tokens.cacheRead,
          tokens.cacheWrite
        );
      }
    }
  }

  // Bump session updated_at on every event
  stmts.touchSession.run(sessionId);

  stmts.insertEvent.run(
    sessionId,
    agentId,
    eventType,
    toolName,
    summary,
    JSON.stringify(data)
    // created_at uses default
  );

  const event = {
    session_id: sessionId,
    agent_id: agentId,
    event_type: eventType,
    tool_name: toolName,
    summary,
    created_at: new Date().toISOString(),
  };
  broadcast("new_event", event);
  return event;
});

router.post("/event", (req, res) => {
  const { hook_type, data } = req.body;
  if (!hook_type || !data) {
    return res.status(400).json({
      error: { code: "INVALID_INPUT", message: "hook_type and data are required" },
    });
  }

  const result = processEvent(hook_type, data);
  if (!result) {
    return res.status(400).json({
      error: { code: "MISSING_SESSION", message: "session_id is required in data" },
    });
  }

  res.json({ ok: true, event: result });
});

module.exports = router;
