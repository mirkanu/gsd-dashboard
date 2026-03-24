const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");

// Set up test database BEFORE requiring any server modules
const TEST_DB = path.join(os.tmpdir(), `dashboard-test-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;

const { createApp, startServer } = require("../index");
const { db, stmts } = require("../db");

let server;
let BASE;

function fetch(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...options.headers },
    };

    const req = http.request(opts, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = body;
        }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });

    req.on("error", reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

function post(urlPath, body) {
  return fetch(urlPath, { method: "POST", body });
}

function patch(urlPath, body) {
  return fetch(urlPath, { method: "PATCH", body });
}

before(async () => {
  const app = createApp();
  server = await startServer(app, 0); // port 0 = random available port
  const addr = server.address();
  BASE = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  if (server) server.close();
  if (db) db.close();
  try {
    fs.unlinkSync(TEST_DB);
    fs.unlinkSync(TEST_DB + "-wal");
    fs.unlinkSync(TEST_DB + "-shm");
  } catch {
    // ignore cleanup errors
  }
  // Force exit since WS heartbeat interval keeps process alive
  setTimeout(() => process.exit(0), 100);
});

// ============================================================
// Health
// ============================================================
describe("GET /api/health", () => {
  it("should return ok status", async () => {
    const res = await fetch("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.ok(res.body.timestamp);
  });
});

// ============================================================
// Sessions CRUD
// ============================================================
describe("Sessions API", () => {
  it("should create a session", async () => {
    const res = await post("/api/sessions", {
      id: "sess-1",
      name: "Test Session",
      cwd: "/home/test",
      model: "claude-opus-4-6",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.session.id, "sess-1");
    assert.equal(res.body.session.name, "Test Session");
    assert.equal(res.body.session.status, "active");
    assert.equal(res.body.session.cwd, "/home/test");
    assert.equal(res.body.created, true);
  });

  it("should return existing session on duplicate create (idempotent)", async () => {
    const res = await post("/api/sessions", {
      id: "sess-1",
      name: "Different Name",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.session.name, "Test Session"); // original name preserved
    assert.equal(res.body.created, false);
  });

  it("should reject session without id", async () => {
    const res = await post("/api/sessions", { name: "No ID" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "INVALID_INPUT");
  });

  it("should get a session by id", async () => {
    const res = await fetch("/api/sessions/sess-1");
    assert.equal(res.status, 200);
    assert.equal(res.body.session.id, "sess-1");
    assert.ok(Array.isArray(res.body.agents));
    assert.ok(Array.isArray(res.body.events));
  });

  it("should return 404 for nonexistent session", async () => {
    const res = await fetch("/api/sessions/nonexistent");
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "NOT_FOUND");
  });

  it("should list sessions", async () => {
    await post("/api/sessions", { id: "sess-2", name: "Session Two" });
    const res = await fetch("/api/sessions");
    assert.equal(res.status, 200);
    assert.ok(res.body.sessions.length >= 2);
  });

  it("should filter sessions by status", async () => {
    const res = await fetch("/api/sessions?status=active");
    assert.equal(res.status, 200);
    res.body.sessions.forEach((s) => assert.equal(s.status, "active"));
  });

  it("should paginate sessions", async () => {
    const res = await fetch("/api/sessions?limit=1&offset=0");
    assert.equal(res.body.sessions.length, 1);
    assert.equal(res.body.limit, 1);
    assert.equal(res.body.offset, 0);
  });

  it("should update a session", async () => {
    const res = await patch("/api/sessions/sess-1", {
      status: "completed",
      ended_at: new Date().toISOString(),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.session.status, "completed");
    assert.ok(res.body.session.ended_at);
  });

  it("should return 404 when updating nonexistent session", async () => {
    const res = await patch("/api/sessions/nonexistent", { status: "error" });
    assert.equal(res.status, 404);
  });
});

// ============================================================
// Agents CRUD
// ============================================================
describe("Agents API", () => {
  it("should create an agent", async () => {
    const res = await post("/api/agents", {
      id: "agent-1",
      session_id: "sess-2",
      name: "Main Agent",
      type: "main",
      status: "connected",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.agent.id, "agent-1");
    assert.equal(res.body.agent.name, "Main Agent");
    assert.equal(res.body.agent.type, "main");
    assert.equal(res.body.created, true);
  });

  it("should return existing agent on duplicate create (idempotent)", async () => {
    const res = await post("/api/agents", {
      id: "agent-1",
      session_id: "sess-2",
      name: "Different",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.agent.name, "Main Agent");
    assert.equal(res.body.created, false);
  });

  it("should reject agent without required fields", async () => {
    const res = await post("/api/agents", { id: "x" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "INVALID_INPUT");
  });

  it("should create a subagent with parent", async () => {
    const res = await post("/api/agents", {
      id: "agent-2",
      session_id: "sess-2",
      name: "Explorer",
      type: "subagent",
      subagent_type: "Explore",
      status: "working",
      task: "Searching for patterns",
      parent_agent_id: "agent-1",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.agent.type, "subagent");
    assert.equal(res.body.agent.subagent_type, "Explore");
    assert.equal(res.body.agent.parent_agent_id, "agent-1");
  });

  it("should get an agent by id", async () => {
    const res = await fetch("/api/agents/agent-1");
    assert.equal(res.status, 200);
    assert.equal(res.body.agent.id, "agent-1");
  });

  it("should return 404 for nonexistent agent", async () => {
    const res = await fetch("/api/agents/nonexistent");
    assert.equal(res.status, 404);
  });

  it("should list all agents", async () => {
    const res = await fetch("/api/agents");
    assert.ok(res.body.agents.length >= 2);
  });

  it("should filter agents by status", async () => {
    const res = await fetch("/api/agents?status=working");
    assert.equal(res.status, 200);
    res.body.agents.forEach((a) => assert.equal(a.status, "working"));
  });

  it("should filter agents by session_id", async () => {
    const res = await fetch("/api/agents?session_id=sess-2");
    assert.equal(res.status, 200);
    res.body.agents.forEach((a) => assert.equal(a.session_id, "sess-2"));
  });

  it("should update an agent", async () => {
    const res = await patch("/api/agents/agent-1", {
      status: "working",
      current_tool: "Bash",
      task: "Running tests",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.agent.status, "working");
    assert.equal(res.body.agent.current_tool, "Bash");
    assert.equal(res.body.agent.task, "Running tests");
  });

  it("should clear current_tool on update", async () => {
    const res = await patch("/api/agents/agent-1", {
      status: "connected",
      current_tool: null,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.agent.current_tool, null);
  });

  it("should return 404 when updating nonexistent agent", async () => {
    const res = await patch("/api/agents/nonexistent", { status: "error" });
    assert.equal(res.status, 404);
  });
});

// ============================================================
// Events
// ============================================================
describe("Events API", () => {
  it("should list events (empty initially)", async () => {
    const res = await fetch("/api/events");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.events));
  });

  it("should respect limit parameter", async () => {
    const res = await fetch("/api/events?limit=5");
    assert.equal(res.status, 200);
    assert.ok(res.body.events.length <= 5);
  });
});

// ============================================================
// Stats
// ============================================================
describe("Stats API", () => {
  it("should return aggregate statistics", async () => {
    const res = await fetch("/api/stats");
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.total_sessions, "number");
    assert.equal(typeof res.body.active_sessions, "number");
    assert.equal(typeof res.body.active_agents, "number");
    assert.equal(typeof res.body.total_agents, "number");
    assert.equal(typeof res.body.total_events, "number");
    assert.equal(typeof res.body.events_today, "number");
    assert.equal(typeof res.body.ws_connections, "number");
    assert.equal(typeof res.body.agents_by_status, "object");
    assert.equal(typeof res.body.sessions_by_status, "object");
  });

  it("should reflect created data in stats", async () => {
    const res = await fetch("/api/stats");
    assert.ok(res.body.total_sessions >= 2);
    assert.ok(res.body.total_agents >= 2);
  });
});

// ============================================================
// Hook Event Processing
// ============================================================
describe("Hook Event Processing", () => {
  it("should reject missing hook_type", async () => {
    const res = await post("/api/hooks/event", { data: { session_id: "x" } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "INVALID_INPUT");
  });

  it("should reject missing data", async () => {
    const res = await post("/api/hooks/event", { hook_type: "PreToolUse" });
    assert.equal(res.status, 400);
  });

  it("should reject missing session_id in data", async () => {
    const res = await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { tool_name: "Bash" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "MISSING_SESSION");
  });

  it("should auto-create session and main agent on first PreToolUse", async () => {
    const res = await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: "hook-sess-1",
        tool_name: "Read",
        tool_input: { file_path: "/test.ts" },
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.event.event_type, "PreToolUse");
    assert.equal(res.body.event.tool_name, "Read");

    // Verify session was created
    const sessRes = await fetch("/api/sessions/hook-sess-1");
    assert.equal(sessRes.status, 200);
    assert.equal(sessRes.body.session.status, "active");

    // Verify main agent was created
    const agentRes = await fetch("/api/agents/hook-sess-1-main");
    assert.equal(agentRes.status, 200);
    assert.equal(agentRes.body.agent.type, "main");
    assert.equal(agentRes.body.agent.status, "working");
    assert.equal(agentRes.body.agent.current_tool, "Read");
  });

  it("should keep main agent working on PostToolUse and clear current_tool", async () => {
    const res = await post("/api/hooks/event", {
      hook_type: "PostToolUse",
      data: {
        session_id: "hook-sess-1",
        tool_name: "Read",
      },
    });
    assert.equal(res.status, 200);

    const agentRes = await fetch("/api/agents/hook-sess-1-main");
    // Status stays "working" — only Stop transitions it
    assert.equal(agentRes.body.agent.status, "working");
    assert.equal(agentRes.body.agent.current_tool, null);
  });

  it("should create subagent when Agent tool is used", async () => {
    const res = await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: "hook-sess-1",
        tool_name: "Agent",
        tool_input: {
          description: "Search codebase",
          subagent_type: "Explore",
          prompt: "Find all TypeScript files with error handling",
        },
      },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.event.summary.includes("Subagent spawned"));

    // Verify subagent exists
    const agentsRes = await fetch("/api/agents?session_id=hook-sess-1");
    const subagents = agentsRes.body.agents.filter((a) => a.type === "subagent");
    assert.ok(subagents.length >= 1);
    const sub = subagents[0];
    assert.equal(sub.name, "Search codebase");
    assert.equal(sub.subagent_type, "Explore");
    assert.equal(sub.status, "working");
    assert.ok(sub.task.includes("Find all TypeScript"));
    assert.equal(sub.parent_agent_id, "hook-sess-1-main");
  });

  it("should mark subagent completed on SubagentStop", async () => {
    const res = await post("/api/hooks/event", {
      hook_type: "SubagentStop",
      data: { session_id: "hook-sess-1" },
    });
    assert.equal(res.status, 200);

    const agentsRes = await fetch("/api/agents?session_id=hook-sess-1");
    const subagents = agentsRes.body.agents.filter((a) => a.type === "subagent");
    const completed = subagents.filter((a) => a.status === "completed");
    assert.ok(completed.length >= 1);
    assert.ok(completed[0].ended_at);
  });

  it("should handle Notification events", async () => {
    const res = await post("/api/hooks/event", {
      hook_type: "Notification",
      data: {
        session_id: "hook-sess-1",
        message: "Task completed successfully",
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.event.summary, "Task completed successfully");
  });

  it("should keep session active and set main agent idle on Stop", async () => {
    // First make sure main agent is in a working state
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-1", tool_name: "Write" },
    });

    const res = await post("/api/hooks/event", {
      hook_type: "Stop",
      data: {
        session_id: "hook-sess-1",
        stop_reason: "end_turn",
      },
    });
    assert.equal(res.status, 200);

    // Session should stay active — Stop means Claude finished responding, not session closed
    const sessRes = await fetch("/api/sessions/hook-sess-1");
    assert.equal(sessRes.body.session.status, "active");

    // Main agent should be idle (waiting for user input)
    const agentsRes = await fetch("/api/agents?session_id=hook-sess-1");
    const main = agentsRes.body.agents.find((a) => a.type === "main");
    assert.equal(main.status, "idle");
  });

  it("should mark session as error when stop_reason is error", async () => {
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-err", tool_name: "Bash" },
    });

    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: "hook-sess-err", stop_reason: "error" },
    });

    const sessRes = await fetch("/api/sessions/hook-sess-err");
    assert.equal(sessRes.body.session.status, "error");
  });

  it("should not create duplicate session on repeated events", async () => {
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-dup", tool_name: "Read" },
    });
    await post("/api/hooks/event", {
      hook_type: "PostToolUse",
      data: { session_id: "hook-sess-dup", tool_name: "Read" },
    });
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-dup", tool_name: "Write" },
    });

    const agentsRes = await fetch("/api/agents?session_id=hook-sess-dup");
    const mainAgents = agentsRes.body.agents.filter((a) => a.type === "main");
    assert.equal(mainAgents.length, 1, "Should have exactly one main agent");
  });

  it("should keep background subagents working on Stop", async () => {
    // Spawn a subagent (may be running in background)
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: "hook-sess-bg",
        tool_name: "Agent",
        tool_input: { prompt: "Analyze code", description: "BG-analyzer" },
      },
    });

    // Stop fires — background subagents stay working, main goes idle, session stays active
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: "hook-sess-bg", stop_reason: "end_turn" },
    });

    const agentsRes = await fetch("/api/agents?session_id=hook-sess-bg");
    const subagent = agentsRes.body.agents.find((a) => a.type === "subagent");
    assert.equal(subagent.status, "working", "Background subagent should stay working on Stop");
    assert.equal(subagent.ended_at, null, "Subagent should not have ended_at");

    const mainAgent = agentsRes.body.agents.find((a) => a.type === "main");
    assert.equal(mainAgent.status, "idle", "Main agent should be idle");

    const sessRes = await fetch("/api/sessions/hook-sess-bg");
    assert.equal(sessRes.body.session.status, "active", "Session should stay active");

    // SubagentStop completes the subagent individually
    await post("/api/hooks/event", {
      hook_type: "SubagentStop",
      data: { session_id: "hook-sess-bg", description: "BG-analyzer" },
    });

    const agentsRes2 = await fetch("/api/agents?session_id=hook-sess-bg");
    const subagent2 = agentsRes2.body.agents.find((a) => a.type === "subagent");
    assert.equal(subagent2.status, "completed", "Subagent should complete on SubagentStop");
    assert.ok(subagent2.ended_at, "Subagent should have ended_at after SubagentStop");
  });

  it("should NOT mark subagent completed on PostToolUse for Agent tool", async () => {
    // Fresh session: spawn a subagent, then PostToolUse fires immediately (backgrounded)
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: "hook-sess-bg2",
        tool_name: "Agent",
        tool_input: { prompt: "Analyze code", description: "BG-analyzer-2" },
      },
    });
    await post("/api/hooks/event", {
      hook_type: "PostToolUse",
      data: {
        session_id: "hook-sess-bg2",
        tool_name: "Agent",
        tool_input: { description: "BG-analyzer-2" },
      },
    });

    const agentsRes = await fetch("/api/agents?session_id=hook-sess-bg2");
    const subagent = agentsRes.body.agents.find((a) => a.type === "subagent");
    assert.equal(subagent.status, "working", "Subagent should still be working after PostToolUse");
  });

  it("should complete subagent on SubagentStop before session Stop", async () => {
    // SubagentStop fires when the background agent actually finishes
    await post("/api/hooks/event", {
      hook_type: "SubagentStop",
      data: { session_id: "hook-sess-bg2", description: "BG-analyzer-2" },
    });

    const agentsRes = await fetch("/api/agents?session_id=hook-sess-bg2");
    const subagent = agentsRes.body.agents.find((a) => a.type === "subagent");
    assert.equal(subagent.status, "completed", "Subagent should be completed after SubagentStop");
    assert.ok(subagent.ended_at, "Subagent should have ended_at timestamp");
  });

  it("should not flicker completed agent status on subsequent tool events", async () => {
    // Create session with active subagent
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: "hook-sess-flicker",
        tool_name: "Agent",
        tool_input: { prompt: "Do work", description: "Worker" },
      },
    });
    // Stop sets main to idle, background subagent stays working
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: "hook-sess-flicker", stop_reason: "end_turn" },
    });

    const agents0 = await fetch("/api/agents?session_id=hook-sess-flicker");
    const main0 = agents0.body.agents.find((a) => a.type === "main");
    assert.equal(main0.status, "idle", "Main should be idle after Stop");

    const sub0 = agents0.body.agents.find((a) => a.type === "subagent");
    assert.equal(sub0.status, "working", "Background subagent should stay working after Stop");
  });

  it("should record events in the events table", async () => {
    const eventsRes = await fetch("/api/events?session_id=hook-sess-1");
    assert.ok(
      eventsRes.body.events.length >= 4,
      "Should have multiple events from hook processing"
    );

    const types = eventsRes.body.events.map((e) => e.event_type);
    assert.ok(types.includes("PreToolUse"));
    assert.ok(types.includes("PostToolUse"));
    assert.ok(types.includes("Stop"));
  });

  it("should reactivate error session on new work events (resume)", async () => {
    // Create session and trigger error
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-resume", tool_name: "Read" },
    });
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: "hook-sess-resume", stop_reason: "error" },
    });

    let sessRes = await fetch("/api/sessions/hook-sess-resume");
    assert.equal(sessRes.body.session.status, "error", "Session should be error after error Stop");

    // Resume: send a new PreToolUse for the same session
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-resume", tool_name: "Write" },
    });

    sessRes = await fetch("/api/sessions/hook-sess-resume");
    assert.equal(sessRes.body.session.status, "active", "Session should be reactivated");
    assert.equal(sessRes.body.session.ended_at, null, "ended_at should be cleared");

    const agentsRes = await fetch("/api/agents?session_id=hook-sess-resume");
    const main = agentsRes.body.agents.find((a) => a.type === "main");
    assert.equal(main.status, "working", "Main agent should be working after resume");
    assert.equal(main.ended_at, null, "Main agent ended_at should be cleared");
  });

  it("should keep session active across multiple Stop events (multi-turn)", async () => {
    // Turn 1: user asks something, Claude responds
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-multiturn", tool_name: "Read" },
    });
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: "hook-sess-multiturn", stop_reason: "end_turn" },
    });

    let sessRes = await fetch("/api/sessions/hook-sess-multiturn");
    assert.equal(sessRes.body.session.status, "active", "Session should stay active after turn 1");

    let agentsRes = await fetch("/api/agents?session_id=hook-sess-multiturn");
    let main = agentsRes.body.agents.find((a) => a.type === "main");
    assert.equal(main.status, "idle", "Main agent should be idle after turn 1 Stop");

    // Turn 2: user asks something else — PreToolUse should transition idle → working
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-multiturn", tool_name: "Write" },
    });

    agentsRes = await fetch("/api/agents?session_id=hook-sess-multiturn");
    main = agentsRes.body.agents.find((a) => a.type === "main");
    assert.equal(main.status, "working", "Main agent should be working during turn 2");

    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: "hook-sess-multiturn", stop_reason: "end_turn" },
    });

    sessRes = await fetch("/api/sessions/hook-sess-multiturn");
    assert.equal(sessRes.body.session.status, "active", "Session should stay active after turn 2");

    agentsRes = await fetch("/api/agents?session_id=hook-sess-multiturn");
    main = agentsRes.body.agents.find((a) => a.type === "main");
    assert.equal(main.status, "idle", "Main agent should be idle after turn 2 Stop");
  });

  it("should mark session completed on SessionEnd", async () => {
    // Create session with some activity
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-end", tool_name: "Read" },
    });
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: "hook-sess-end", stop_reason: "end_turn" },
    });

    // Session should still be active after Stop
    let sessRes = await fetch("/api/sessions/hook-sess-end");
    assert.equal(sessRes.body.session.status, "active");

    // SessionEnd fires when CLI exits
    await post("/api/hooks/event", {
      hook_type: "SessionEnd",
      data: { session_id: "hook-sess-end", reason: "prompt_input_exit" },
    });

    sessRes = await fetch("/api/sessions/hook-sess-end");
    assert.equal(
      sessRes.body.session.status,
      "completed",
      "Session should be completed after SessionEnd"
    );
    assert.ok(sessRes.body.session.ended_at, "Session should have ended_at");

    const agentsRes = await fetch("/api/agents?session_id=hook-sess-end");
    agentsRes.body.agents.forEach((a) => {
      assert.equal(a.status, "completed", `Agent ${a.name} should be completed`);
    });
  });

  it("should extract token usage from transcript_path on Stop", async () => {
    // Create a temporary JSONL transcript file
    const transcriptPath = path.join(os.tmpdir(), `transcript-test-${Date.now()}.jsonl`);
    // Real Claude Code transcript format: model/usage are nested inside entry.message
    const lines = [
      JSON.stringify({ type: "user", message: { role: "user", content: "Hello" } }),
      JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-sonnet-4-6",
          role: "assistant",
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 200,
            cache_creation_input_tokens: 10,
          },
        },
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-sonnet-4-6",
          role: "assistant",
          usage: {
            input_tokens: 150,
            output_tokens: 75,
            cache_read_input_tokens: 300,
            cache_creation_input_tokens: 0,
          },
        },
      }),
      JSON.stringify({ type: "progress" }), // Non-message entries should be skipped
      JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-opus-4-6",
          role: "assistant",
          usage: {
            input_tokens: 500,
            output_tokens: 200,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 50,
          },
        },
      }),
    ];
    fs.writeFileSync(transcriptPath, lines.join("\n") + "\n");

    // Send Stop event with transcript_path
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-transcript", tool_name: "Read" },
    });
    const res = await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: "hook-sess-transcript", transcript_path: transcriptPath },
    });
    assert.equal(res.status, 200);

    // Check token_usage was written
    const costRes = await fetch("/api/pricing/cost/hook-sess-transcript");
    assert.equal(costRes.status, 200);

    const sonnet = costRes.body.breakdown.find((b) => b.model === "claude-sonnet-4-6");
    assert.ok(sonnet, "Should have sonnet token data");
    assert.equal(sonnet.input_tokens, 250);
    assert.equal(sonnet.output_tokens, 125);
    assert.equal(sonnet.cache_read_tokens, 500);
    assert.equal(sonnet.cache_write_tokens, 10);

    const opus = costRes.body.breakdown.find((b) => b.model === "claude-opus-4-6");
    assert.ok(opus, "Should have opus token data");
    assert.equal(opus.input_tokens, 500);
    assert.equal(opus.output_tokens, 200);

    // Clean up
    fs.unlinkSync(transcriptPath);
  });

  it("should update token usage on every event, not just Stop", async () => {
    // Create a transcript that grows over time (simulating mid-session reads)
    const transcriptPath = path.join(os.tmpdir(), `transcript-mid-${Date.now()}.jsonl`);
    const line1 = JSON.stringify({
      type: "assistant",
      message: {
        model: "claude-sonnet-4-6",
        role: "assistant",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    });
    fs.writeFileSync(transcriptPath, line1 + "\n");

    // PreToolUse event with transcript_path should trigger token extraction
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-mid", tool_name: "Read", transcript_path: transcriptPath },
    });

    const midRes = await fetch("/api/pricing/cost/hook-sess-mid");
    assert.equal(midRes.status, 200);
    const midSonnet = midRes.body.breakdown.find((b) => b.model === "claude-sonnet-4-6");
    assert.ok(midSonnet, "Should have token data after PreToolUse");
    assert.equal(midSonnet.input_tokens, 100);
    assert.equal(midSonnet.output_tokens, 50);

    // Transcript grows — second assistant response added
    const line2 = JSON.stringify({
      type: "assistant",
      message: {
        model: "claude-sonnet-4-6",
        role: "assistant",
        usage: {
          input_tokens: 200,
          output_tokens: 80,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    });
    fs.appendFileSync(transcriptPath, line2 + "\n");

    // PostToolUse event should pick up the updated transcript
    await post("/api/hooks/event", {
      hook_type: "PostToolUse",
      data: { session_id: "hook-sess-mid", tool_name: "Read", transcript_path: transcriptPath },
    });

    const updatedRes = await fetch("/api/pricing/cost/hook-sess-mid");
    const updatedSonnet = updatedRes.body.breakdown.find((b) => b.model === "claude-sonnet-4-6");
    assert.ok(updatedSonnet, "Should have updated token data after PostToolUse");
    // replaceTokenUsage overwrites with totals from full transcript (100+200=300, 50+80=130)
    assert.equal(updatedSonnet.input_tokens, 300);
    assert.equal(updatedSonnet.output_tokens, 130);

    fs.unlinkSync(transcriptPath);
  });
});

// ============================================================
// Database Integrity
// ============================================================
describe("Database Integrity", () => {
  it("should enforce session status CHECK constraint", () => {
    assert.throws(() => {
      stmts.insertSession.run("bad-status", "test", "invalid_status", null, null, null);
    });
  });

  it("should enforce agent status CHECK constraint", () => {
    assert.throws(() => {
      stmts.insertAgent.run(
        "bad-agent",
        "sess-2",
        "Test",
        "main",
        null,
        "invalid_status",
        null,
        null,
        null
      );
    });
  });

  it("should enforce agent type CHECK constraint", () => {
    assert.throws(() => {
      stmts.insertAgent.run(
        "bad-agent2",
        "sess-2",
        "Test",
        "invalid_type",
        null,
        "idle",
        null,
        null,
        null
      );
    });
  });

  it("should cascade delete agents when session is deleted", () => {
    // Create a session with agents
    stmts.insertSession.run("cascade-test", "Cascade Test", "active", null, null, null);
    stmts.insertAgent.run(
      "cascade-agent",
      "cascade-test",
      "Agent",
      "main",
      null,
      "idle",
      null,
      null,
      null
    );

    // Verify agent exists
    assert.ok(stmts.getAgent.get("cascade-agent"));

    // Delete session
    db.prepare("DELETE FROM sessions WHERE id = ?").run("cascade-test");

    // Agent should be gone
    assert.equal(stmts.getAgent.get("cascade-agent"), undefined);
  });

  it("should have all expected indexes", () => {
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")
      .all()
      .map((r) => r.name);

    assert.ok(indexes.includes("idx_agents_session"));
    assert.ok(indexes.includes("idx_agents_status"));
    assert.ok(indexes.includes("idx_events_session"));
    assert.ok(indexes.includes("idx_events_type"));
    assert.ok(indexes.includes("idx_events_created"));
    assert.ok(indexes.includes("idx_sessions_status"));
    assert.ok(indexes.includes("idx_sessions_started"));
  });

  it("should use WAL journal mode", () => {
    const mode = db.pragma("journal_mode", { simple: true });
    assert.equal(mode, "wal");
  });

  it("should have foreign keys enabled", () => {
    const fk = db.pragma("foreign_keys", { simple: true });
    assert.equal(fk, 1);
  });
});

// ============================================================
// readProjectMeta
// ============================================================

describe("readProjectMeta", () => {
  const { readProjectMeta, readProject } = require("../gsd/readers");

  it("returns version and liveUrl for a project with PROJECT.md (gsddashboard)", () => {
    const GSDDASHBOARD_ROOT = path.join(__dirname, "../..");
    const result = readProjectMeta(GSDDASHBOARD_ROOT);
    assert.ok(result !== null, "result should not be null");
    assert.ok(typeof result.version === "string", `version should be a string, got: ${result.version}`);
    assert.ok(result.version.startsWith("v"), `version should start with 'v', got: ${result.version}`);
    assert.ok(typeof result.liveUrl === "string", `liveUrl should be a string, got: ${result.liveUrl}`);
    assert.ok(result.liveUrl.startsWith("https://"), `liveUrl should start with 'https://', got: ${result.liveUrl}`);
  });

  it("returns null for both fields when PROJECT.md does not exist", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-test-"));
    try {
      const result = readProjectMeta(tmpDir);
      assert.deepEqual(result, { version: null, liveUrl: null });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("readProject return value includes version and liveUrl keys", () => {
    const GSDDASHBOARD_ROOT = path.join(__dirname, "../..");
    const project = readProject("gsddashboard", GSDDASHBOARD_ROOT);
    assert.ok(Object.prototype.hasOwnProperty.call(project, "version"), "project should have version key");
    assert.ok(Object.prototype.hasOwnProperty.call(project, "liveUrl"), "project should have liveUrl key");
  });
});

// ============================================================
// resolveFile
// ============================================================

describe("resolveFile", () => {
  const { resolveFile } = require("../gsd/fileResolver");
  const GSDDASHBOARD_ROOT = path.join(__dirname, "../..");

  it("maps 'state' to .planning/STATE.md", () => {
    const result = resolveFile("gsddashboard", GSDDASHBOARD_ROOT, "state");
    assert.equal(result, path.join(GSDDASHBOARD_ROOT, ".planning", "STATE.md"));
  });

  it("maps 'roadmap' to .planning/ROADMAP.md", () => {
    const result = resolveFile("gsddashboard", GSDDASHBOARD_ROOT, "roadmap");
    assert.equal(result, path.join(GSDDASHBOARD_ROOT, ".planning", "ROADMAP.md"));
  });

  it("maps 'requirements' to .planning/REQUIREMENTS.md", () => {
    const result = resolveFile("gsddashboard", GSDDASHBOARD_ROOT, "requirements");
    assert.equal(result, path.join(GSDDASHBOARD_ROOT, ".planning", "REQUIREMENTS.md"));
  });

  it("resolves 'plan' to a path ending in -PLAN.md", () => {
    const result = resolveFile("gsddashboard", GSDDASHBOARD_ROOT, "plan");
    assert.ok(result !== null, "plan resolution should not return null");
    assert.ok(result.endsWith("-PLAN.md"), `expected path ending in -PLAN.md, got: ${result}`);
  });

  it("returns null for unknown fileId", () => {
    const result = resolveFile("gsddashboard", GSDDASHBOARD_ROOT, "unknown");
    assert.equal(result, null);
  });

  it("returns null for 'plan' when root has no STATE.md", () => {
    const result = resolveFile("nonexistent", "/tmp/no-such-root-gsddashboard", "plan");
    assert.equal(result, null);
  });
});

// ============================================================
// GET /api/gsd/projects/:name/files/:fileId
// ============================================================

describe("GET /api/gsd/projects/:name/files/:fileId", () => {
  it("returns 200 text/plain with STATE.md content for 'state'", async () => {
    const res = await fetch("/api/gsd/projects/gsddashboard/files/state");
    assert.equal(res.status, 200);
    assert.ok(res.headers["content-type"].includes("text/plain"), `expected text/plain, got: ${res.headers["content-type"]}`);
    assert.ok(typeof res.body === "string" && res.body.length > 0, "body should be non-empty string");
    assert.ok(res.body.includes("Phase"), "STATE.md content should mention Phase");
  });

  it("returns 200 text/plain with ROADMAP.md content for 'roadmap'", async () => {
    const res = await fetch("/api/gsd/projects/gsddashboard/files/roadmap");
    assert.equal(res.status, 200);
    assert.ok(res.headers["content-type"].includes("text/plain"), `expected text/plain, got: ${res.headers["content-type"]}`);
    assert.ok(typeof res.body === "string" && res.body.length > 0, "body should be non-empty string");
  });

  it("returns 200 text/plain with REQUIREMENTS.md content for 'requirements'", async () => {
    const res = await fetch("/api/gsd/projects/gsddashboard/files/requirements");
    assert.equal(res.status, 200);
    assert.ok(res.headers["content-type"].includes("text/plain"), `expected text/plain, got: ${res.headers["content-type"]}`);
    assert.ok(typeof res.body === "string" && res.body.length > 0, "body should be non-empty string");
  });

  it("returns 200 text/plain with active PLAN.md content for 'plan'", async () => {
    const res = await fetch("/api/gsd/projects/gsddashboard/files/plan");
    assert.equal(res.status, 200);
    assert.ok(res.headers["content-type"].includes("text/plain"), `expected text/plain, got: ${res.headers["content-type"]}`);
    assert.ok(typeof res.body === "string" && res.body.length > 0, "body should be non-empty string");
    assert.ok(res.body.includes("PLAN") || res.body.includes("phase") || res.body.includes("task"), "body should contain PLAN.md content");
  });

  it("returns 404 JSON for unknown project", async () => {
    const res = await fetch("/api/gsd/projects/unknown-project-xyz/files/state");
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "Project not found");
  });

  it("returns 400 JSON for unknown fileId", async () => {
    const res = await fetch("/api/gsd/projects/gsddashboard/files/bogus");
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Unknown file identifier");
  });
});

describe("Auto-registration of GSD projects via PostToolUse", () => {
  const GSD_PROJECTS_PATH = path.resolve(__dirname, "../../gsd-projects.json");
  let originalConfig;

  before(() => {
    originalConfig = fs.readFileSync(GSD_PROJECTS_PATH, "utf8");
  });

  after(() => {
    fs.writeFileSync(GSD_PROJECTS_PATH, originalConfig, "utf8");
  });

  it("registers a new project when Write tool writes .planning/PROJECT.md", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-auto-reg-"));
    const projectName = path.basename(tmpDir);

    const res = await post("/api/hooks/event", {
      hook_type: "PostToolUse",
      data: {
        session_id: "auto-reg-sess-1",
        tool_name: "Write",
        tool_input: { file_path: path.join(tmpDir, ".planning/PROJECT.md") },
        cwd: tmpDir,
      },
    });
    assert.equal(res.status, 200);

    const config = JSON.parse(fs.readFileSync(GSD_PROJECTS_PATH, "utf8"));
    const added = config.projects.find((p) => p.name === projectName);
    assert.ok(added, "New project should be in gsd-projects.json");
    assert.equal(added.root, tmpDir);
  });

  it("does not duplicate a project already in the config", async () => {
    const configBefore = JSON.parse(fs.readFileSync(GSD_PROJECTS_PATH, "utf8"));
    const existing = configBefore.projects[0];

    await post("/api/hooks/event", {
      hook_type: "PostToolUse",
      data: {
        session_id: "auto-reg-sess-2",
        tool_name: "Write",
        tool_input: { file_path: path.join(existing.root, ".planning/PROJECT.md") },
        cwd: existing.root,
      },
    });

    const configAfter = JSON.parse(fs.readFileSync(GSD_PROJECTS_PATH, "utf8"));
    const matches = configAfter.projects.filter((p) => p.root === existing.root);
    assert.equal(matches.length, 1, "Project should not be duplicated");
  });

  it("ignores Write events for non-PROJECT.md files", async () => {
    const configBefore = JSON.parse(fs.readFileSync(GSD_PROJECTS_PATH, "utf8"));
    const countBefore = configBefore.projects.length;

    await post("/api/hooks/event", {
      hook_type: "PostToolUse",
      data: {
        session_id: "auto-reg-sess-3",
        tool_name: "Write",
        tool_input: { file_path: "/some/project/.planning/STATE.md" },
        cwd: "/some/project",
      },
    });

    const configAfter = JSON.parse(fs.readFileSync(GSD_PROJECTS_PATH, "utf8"));
    assert.equal(configAfter.projects.length, countBefore, "No project should be added for non-PROJECT.md writes");
  });
});

// ============================================================
// Agent data proxy
// ============================================================
describe("agent data proxy", () => {
  let mockUpstream;
  let proxyServer;
  let PROXY_BASE;

  function pfetch(urlPath, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlPath, PROXY_BASE);
      const opts = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method || "GET",
        headers: { "Content-Type": "application/json", ...options.headers },
      };

      const req = http.request(opts, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        });
      });

      req.on("error", reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  before(async () => {
    mockUpstream = http.createServer((req, res) => {
      if (req.method === "GET" && req.url === "/api/sessions") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ sessions: ["proxied"], limit: 50, offset: 0 }));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({}));
      }
    });

    await new Promise((resolve) => mockUpstream.listen(0, "127.0.0.1", resolve));
    const mockPort = mockUpstream.address().port;
    process.env.GSD_DATA_URL = `http://127.0.0.1:${mockPort}`;

    proxyServer = await startServer(createApp(), 0);
    PROXY_BASE = `http://127.0.0.1:${proxyServer.address().port}`;
  });

  after(() => {
    proxyServer?.close();
    mockUpstream?.close();
    delete process.env.GSD_DATA_URL;
  });

  it("GET /api/sessions is proxied to upstream when GSD_DATA_URL is set", async () => {
    const res = await pfetch("/api/sessions");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.sessions, ["proxied"]);
  });

  it("POST /api/sessions is not proxied even when GSD_DATA_URL is set", async () => {
    const res = await pfetch("/api/sessions", { method: "POST", body: JSON.stringify({}) });
    assert.equal(res.status, 400);
  });

  it("GET /api/sessions uses local SQLite when GSD_DATA_URL is not set", async () => {
    const res = await fetch("/api/sessions");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.sessions));
  });
});

// ============================================================
// readProject stats
// ============================================================

describe('readProject stats', () => {
  const { readProject, readState } = require('../gsd/readers');
  const PROJECT_ROOT = path.join(__dirname, '../..');

  it('returns velocity as a non-negative integer', () => {
    const p = readProject('gsddashboard', PROJECT_ROOT);
    assert.ok(typeof p.velocity === 'number' && p.velocity >= 0);
  });

  it('returns streak as a non-negative integer', () => {
    const p = readProject('gsddashboard', PROJECT_ROOT);
    assert.ok(typeof p.streak === 'number' && p.streak >= 0);
  });

  it('returns estimatedCompletion as null or non-empty string', () => {
    const p = readProject('gsddashboard', PROJECT_ROOT);
    assert.ok(p.estimatedCompletion === null || (typeof p.estimatedCompletion === 'string' && p.estimatedCompletion.length > 0));
  });

  it('readState returns next_action as string or null', () => {
    const state = readState(PROJECT_ROOT);
    assert.ok(state !== null);
    assert.ok(state.next_action === null || typeof state.next_action === 'string');
  });
});

describe('Phase 9: tmuxActive', () => {
  const { isTmuxSessionActive } = require('../gsd/tmux');

  it('GET /api/gsd/projects — every project has a boolean tmuxActive field', async () => {
    const res = await fetch('/api/gsd/projects');
    assert.equal(res.status, 200);
    const { projects } = res.body;
    assert.ok(Array.isArray(projects) && projects.length > 0);
    for (const p of projects) {
      assert.ok(
        typeof p.tmuxActive === 'boolean',
        `Expected tmuxActive to be boolean for project "${p.name}", got ${typeof p.tmuxActive}`
      );
    }
  });

  it('isTmuxSessionActive(null) returns false', () => {
    assert.equal(isTmuxSessionActive(null), false);
  });

  it('isTmuxSessionActive("") returns false', () => {
    assert.equal(isTmuxSessionActive(''), false);
  });

  it('isTmuxSessionActive returns false for a session that does not exist', () => {
    assert.equal(isTmuxSessionActive('nonexistent-tmux-session-xyz-99999'), false);
  });
});
