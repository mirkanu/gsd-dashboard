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
        const msg = JSON.parse(line);
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
    stmts.insertAgent.run(
      mainAgentId,
      sessionId,
      "Main Agent",
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

  ensureSession(sessionId, data);
  const mainAgent = getMainAgent(sessionId);
  const mainAgentId = mainAgent?.id ?? null;

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

      // Update main agent status — but only if it's not idle (waiting for subagents).
      // When main agent is idle, tool calls are from subagents, not the main agent.
      if (mainAgent && mainAgent.status !== "idle") {
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

      // Don't change main agent status — keep it "working" for the entire turn.
      // Only clear current_tool to show the tool finished.
      // Status transitions happen at Stop (→ completed/idle), not here.
      if (mainAgent && mainAgent.status !== "idle") {
        stmts.updateAgent.run(null, null, null, null, null, null, mainAgentId);
        broadcast("agent_updated", stmts.getAgent.get(mainAgentId));
      }
      break;
    }

    case "Stop": {
      summary = `Session ended: ${data.stop_reason || "completed"}`;
      const endStatus = data.stop_reason === "error" ? "error" : "completed";

      // End agents in this session, but skip working subagents (they're still running in background)
      const agents = stmts.listAgentsBySession.all(sessionId);
      const hasActiveSubagents = agents.some(
        (a) => a.type === "subagent" && a.status === "working"
      );
      for (const agent of agents) {
        if (agent.type === "subagent" && agent.status === "working") {
          continue; // Don't mark running subagents as completed
        }
        if (agent.status === "working" || agent.status === "connected" || agent.status === "idle") {
          stmts.updateAgent.run(
            null,
            hasActiveSubagents && agent.type === "main" ? "idle" : "completed",
            null,
            null,
            hasActiveSubagents && agent.type === "main" ? null : new Date().toISOString(),
            null,
            agent.id
          );
          broadcast("agent_updated", stmts.getAgent.get(agent.id));
        }
      }

      // Don't end session if subagents are still running
      if (hasActiveSubagents) {
        broadcast("session_updated", stmts.getSession.get(sessionId));
      } else {
        stmts.updateSession.run(null, endStatus, new Date().toISOString(), null, sessionId);
        broadcast("session_updated", stmts.getSession.get(sessionId));
      }
      break;
    }

    case "SubagentStop": {
      summary = `Subagent completed`;
      const subagents = stmts.listAgentsBySession.all(sessionId);
      let matchingSub = null;

      // Try to identify which subagent stopped using available data
      const subDesc = data.description || data.subagent_type || null;
      if (subDesc) {
        const namePrefix = subDesc.length > 57 ? subDesc.slice(0, 57) : subDesc;
        matchingSub = subagents.find(
          (a) => a.type === "subagent" && a.status === "working" && a.name.startsWith(namePrefix)
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

        // If all subagents done, complete the session
        const remainingWorking = subagents.filter(
          (a) => a.type === "subagent" && a.status === "working" && a.id !== matchingSub.id
        );
        if (remainingWorking.length === 0) {
          const session = stmts.getSession.get(sessionId);
          if (session && session.status === "active") {
            const currentMain = getMainAgent(sessionId);
            if (!currentMain || currentMain.status !== "working") {
              stmts.updateSession.run(null, "completed", new Date().toISOString(), null, sessionId);
              broadcast("session_updated", stmts.getSession.get(sessionId));
            }
          }
        }
      }
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
