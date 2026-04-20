# Phase 51: GUI Project Creation + Import - Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9 (100% match coverage)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server/routes/projects.js` | controller | CRUD + event-driven | `server/routes/services.js` | exact |
| `server/db.js` (migration: `creation_state`) | migration | schema extension | `server/db.js` (existing migrations) | exact |
| `client/src/components/NewProjectDialog.tsx` | component | request-response | `client/src/components/services/AddCostDialog.tsx` | exact |
| `client/src/components/ImportProjectDialog.tsx` | component | request-response | `client/src/components/services/AddCostDialog.tsx` | exact |
| `client/src/components/ProjectCreationCard.tsx` | component | streaming (via state broadcaster) | `client/src/components/ProjectMetadata.tsx` | role-match |
| `client/src/components/ProjectProgressChip.tsx` | component | streaming | `client/src/components/StatusBadge.tsx` | role-match |
| `server/gsd/projectScaffold.js` | utility | file-I/O | `scripts/install-hooks.js` | role-match |
| `server/gsd/projectDetector.js` | utility | file-I/O | `server/gsd/fileResolver.js` | role-match |
| `server/routes/proxy.js` (update: PROXY_PREFIXES) | config | routing | `server/routes/proxy.js` (existing) | exact |

---

## Pattern Assignments

### `server/routes/projects.js` (controller, CRUD + event-driven)

**Analog:** `server/routes/services.js` (lines 1-100)

**Imports pattern** (Express + async patterns):
```javascript
const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { db } = require("../db");
```

**Route handler structure** (request validation → business logic → response):
```javascript
// GET /api/services/status — fetches and returns normalized data
router.get("/status", async (_req, res) => {
  try {
    const config = loadConfig();
    // ... business logic ...
    res.json(data);
  } catch (err) {
    return res.status(500).json({ error: "message", detail: err.message });
  }
});
```

**Error handling pattern** (try-catch, status codes, plain-English messages):
```javascript
try {
  // operation
  res.json(result);
} catch (err) {
  console.error('[route-name]', err);
  res.status(500).json({ error: "Plain English message", detail: err.message });
}
```

**Config load/save pattern** (from gsd.js lines 27-36):
```javascript
function loadConfig() {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, "../../gsd-projects.json");
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw);
}

function saveConfig(config) {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, '../../gsd-projects.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}
```

**Async fetch pattern** (with timeout and error handling):
```javascript
async function fetchData(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) {
      return { error: "HTTP " + res.status };
    }
    return await res.json();
  } catch (err) {
    return { error: err.message || "Fetch error" };
  }
}
```

---

### `server/db.js` (migration: `creation_state` table)

**Analog:** `server/db.js` (lines 121-177, migration pattern)

**Migration pattern** (try-get → if fails, create table block):
```javascript
// Migration: add creation_state table (Phase 51)
try {
  db.prepare("SELECT 1 FROM creation_state LIMIT 1").get();
} catch {
  db.exec(`
    CREATE TABLE IF NOT EXISTS creation_state (
      project_name TEXT PRIMARY KEY,
      last_completed_step TEXT NOT NULL,
      step_sequence TEXT NOT NULL,
      failed_at_step TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_creation_state_project ON creation_state(project_name);
  `);
}
```

**Prepared statement pattern** (from db.js lines 22-23, app-settings.js):
```javascript
const getCreationStmnt = db.prepare("SELECT * FROM creation_state WHERE project_name = ?");
const insertCreationStmnt = db.prepare(`
  INSERT INTO creation_state (project_name, last_completed_step, step_sequence)
  VALUES (?, ?, ?)
  ON CONFLICT(project_name) DO UPDATE SET
    last_completed_step = excluded.last_completed_step,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
`);
```

---

### `client/src/components/NewProjectDialog.tsx` (component, request-response)

**Analog:** `client/src/components/services/AddCostDialog.tsx` (lines 1-249)

**Imports pattern** (React + lucide + API utilities):
```typescript
import { useState, useEffect } from "react";
import { X, Loader2, ChevronDown } from "lucide-react";
import { api } from "../../lib/api";
import type { GsdProject } from "../../lib/types";
```

**Dialog structure** (fixed overlay, backdrop, stop-propagation):
```typescript
if (!open) return null;

return (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    onClick={onClose}
  >
    <div
      className="bg-surface-1 border border-border rounded-lg w-full max-w-md shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header with title and close button */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <h2 className="text-base font-semibold text-gray-100">+ New Project</h2>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-surface-2 text-gray-400 hover:text-gray-200"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
        {/* fields */}
      </form>
    </div>
  </div>
);
```

**Form field pattern** (label + input + optional validation error):
```typescript
<div>
  <label className="block text-xs font-medium text-gray-400 mb-1">Name *</label>
  <input
    type="text"
    value={name}
    onChange={(e) => setName(e.target.value)}
    placeholder="my-project"
    className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-gray-100"
    required
  />
  {nameError && (
    <div className="text-xs text-red-400 mt-1">{nameError}</div>
  )}
</div>
```

**Submit handler pattern** (validation → setSubmitting → API call → onClose):
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!valid || submitting) return;
  setSubmitting(true);
  setError(null);
  try {
    const result = await api.projects.create({
      name,
      description,
      template: "blank",
      visibility: visibility as "private" | "public",
    });
    onCreated(result);
    onClose();
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to create project");
    setSubmitting(false);
  }
};
```

**Button bar pattern** (cancel + primary action, right-aligned):
```typescript
<div className="flex items-center justify-end gap-2 pt-2">
  <button
    type="button"
    onClick={onClose}
    className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-2"
  >
    Cancel
  </button>
  <button
    type="submit"
    disabled={!valid || submitting}
    className="px-4 py-1.5 rounded text-sm bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 border border-indigo-500/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
  >
    {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
    Create
  </button>
</div>
```

---

### `client/src/components/ImportProjectDialog.tsx` (component, request-response)

**Analog:** Same as NewProjectDialog above (AddCostDialog structure)

**Key differences from NewProject:**
- Async folder dropdown fetch on dialog open (instead of static form)
- Conditional seeding confirmation sub-dialog (separate modal, not inline)
- Two input modes: dropdown (pre-populated) + custom path text input

**Folder dropdown pattern** (async fetch, loading state):
```typescript
const [folders, setFolders] = useState<string[]>([]);
const [loadingFolders, setLoadingFolders] = useState(false);

useEffect(() => {
  if (!open) return;
  
  setLoadingFolders(true);
  api.projects.importCandidates()
    .then(data => setFolders(data.candidates || []))
    .catch(err => console.error(err))
    .finally(() => setLoadingFolders(false));
}, [open]);

// In form:
<select disabled={loadingFolders} value={selectedFolder} onChange={...}>
  <option value="">Select a folder…</option>
  {folders.map(f => <option key={f} value={f}>{f}</option>)}
</select>
```

**Seeding confirmation dialog** (nested modal logic):
```typescript
const [showSeedingConfirm, setShowSeedingConfirm] = useState(false);

if (showSeedingConfirm) {
  return (
    <ConfirmDialog
      title="Seed .planning/ ?"
      message="This folder isn't a GSD project yet. Run /gsd-analyse-codebase to initialize it?"
      onConfirm={() => {
        setShowSeedingConfirm(false);
        handleImportWithSeeding();
      }}
      onCancel={() => setShowSeedingConfirm(false)}
    />
  );
}
```

---

### `client/src/components/ProjectCreationCard.tsx` (component, streaming via state broadcaster)

**Analog:** `client/src/components/ProjectMetadata.tsx` (lines 1-106)

**Import pattern** (streaming from state broadcaster, WebSocket updates):
```typescript
import { useEffect, useState } from "react";
import type { GsdProject } from "../lib/types";
```

**State progression display** (reflects creation pipeline state):
```typescript
export function ProjectCreationCard({ project }: { project: GsdProject }) {
  // During creation, project.creation_state = { step, status, progress, error }
  // Updated live by state broadcaster WebSocket messages
  
  const { creation_state } = project;
  
  if (!creation_state) return null; // Card only shows during creation
  
  const isComplete = creation_state.status === 'working';
  const isFailed = creation_state.status === 'error';
  
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h3>{project.display_name || project.name}</h3>
        {creation_state.progress && (
          <span className="text-xs px-2 py-1 rounded bg-accent/20 text-accent-400">
            {creation_state.progress}%
          </span>
        )}
      </div>
      
      {/* Step-by-step progress chips */}
      <div className="space-y-2 mt-3">
        {CREATION_STEPS.map((step) => (
          <ProjectProgressChip
            key={step}
            step={step}
            state={creation_state}
          />
        ))}
      </div>
      
      {isFailed && (
        <div className="text-red-400 text-sm mt-3">
          {creation_state.error}
          <button onClick={onResume} className="btn-ghost text-xs ml-2">
            Resume
          </button>
        </div>
      )}
    </div>
  );
}
```

**State flow pattern** (WebSocket push updates project.creation_state):
```typescript
// In parent (e.g., ProjectsList):
// websocket message: { type: 'project_state_change', project: name, creation_state: {...} }
// Update project object with new creation_state, re-render card
```

---

### `client/src/components/ProjectProgressChip.tsx` (component, streaming)

**Analog:** `client/src/components/StatusBadge.tsx` (status coloring logic)

**Pattern** (conditional styling based on step completion state):
```typescript
import { CheckCircle, Loader2 } from "lucide-react";

interface ProjectProgressChipProps {
  step: string; // 'creating_repo' | 'pushing' | 'starting_tmux' | 'launching_claude'
  state: CreationState;
}

export function ProjectProgressChip({ step, state }: ProjectProgressChipProps) {
  const steps = ['creating_repo', 'pushing', 'starting_tmux', 'launching_claude'];
  const stepIndex = steps.indexOf(step);
  const currentIndex = steps.indexOf(state.current_step);
  const completedIndex = steps.indexOf(state.last_completed_step);
  
  const isDone = completedIndex >= stepIndex;
  const isCurrent = currentIndex === stepIndex;
  const isPending = stepIndex > currentIndex;
  
  const STEP_LABELS: Record<string, string> = {
    'creating_repo': 'Creating repo',
    'pushing': 'Pushing to GitHub',
    'starting_tmux': 'Starting tmux',
    'launching_claude': 'Launching Claude',
  };
  
  return (
    <div className={`flex items-center gap-2 text-xs py-1 px-2 rounded ${
      isDone ? 'bg-green-500/10 text-green-400' :
      isCurrent ? 'bg-indigo-500/15 text-indigo-200' :
      'bg-gray-500/10 text-gray-400'
    }`}>
      {isDone && <CheckCircle className="w-3 h-3" />}
      {isCurrent && <Loader2 className="w-3 h-3 animate-spin" />}
      {isPending && <div className="w-3 h-3 rounded-full border border-gray-500/50" />}
      <span>{STEP_LABELS[step]}</span>
    </div>
  );
}
```

---

### `server/gsd/projectScaffold.js` (utility, file-I/O)

**Analog:** `scripts/install-hooks.js` (file creation, path handling, fs patterns)

**Pattern** (fs.mkdirSync recursive, file template writing):
```javascript
const fs = require("fs");
const path = require("path");

function scaffoldProject(projectRoot, { name, description }) {
  // Create root directory
  fs.mkdirSync(projectRoot, { recursive: true });
  
  // Create README
  const readmeContent = `# ${name}

${description || 'A new GSD project'}
`;
  fs.writeFileSync(path.join(projectRoot, "README.md"), readmeContent, "utf8");
  
  // Create .gitignore
  const gitignoreContent = `node_modules/
.env
.env.local
.planning/worktrees
.planning/phase-cache
*.swp
*.swo
.DS_Store
Thumbs.db
`;
  fs.writeFileSync(path.join(projectRoot, ".gitignore"), gitignoreContent, "utf8");
  
  // Create package.json with GSD dependency
  const packageJson = {
    name: name.toLowerCase().replace(/[^a-z0-9-]/g, ""),
    version: "0.1.0",
    description: description || "",
    private: true,
  };
  fs.writeFileSync(
    path.join(projectRoot, "package.json"),
    JSON.stringify(packageJson, null, 2) + "\n",
    "utf8"
  );
}

// Name sanitization pattern (from CONTEXT.md D-07)
function sanitizeName(input) {
  // lowercase, ASCII, spaces → dashes, strip disallowed, collapse dashes, trim
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")      // strip non-ASCII
    .replace(/\s+/g, "-")                // spaces → dashes
    .replace(/-+/g, "-")                 // collapse dashes
    .replace(/^-|-$/g, "");              // trim leading/trailing dashes
}

module.exports = { scaffoldProject, sanitizeName };
```

---

### `server/gsd/projectDetector.js` (utility, file-I/O)

**Analog:** `server/gsd/fileResolver.js` (directory traversal, fs operations)

**Pattern** (readdir, filter by manifest/git presence):
```javascript
const fs = require("fs");
const path = require("path");

const MANIFEST_FILES = [".git", "package.json", "pyproject.toml", "Cargo.toml", "go.mod"];
const EXCLUDE_DIRS = new Set(["node_modules", "dist", ".venv", "venv", ".git"]);

function isProject(folderPath) {
  try {
    const items = fs.readdirSync(folderPath);
    // Check for any manifest or .git directory
    return MANIFEST_FILES.some(f => items.includes(f));
  } catch {
    return false;
  }
}

function detectUnregisteredFolders(dataHomeRoot, registeredNames) {
  const registered = new Set(registeredNames);
  const candidates = [];
  
  try {
    const entries = fs.readdirSync(dataHomeRoot, { withFileTypes: true });
    for (const entry of entries) {
      // Skip dotfiles, already-registered, and known non-projects
      if (entry.name.startsWith(".") || registered.has(entry.name) || EXCLUDE_DIRS.has(entry.name)) {
        continue;
      }
      
      if (entry.isDirectory()) {
        const fullPath = path.join(dataHomeRoot, entry.name);
        if (isProject(fullPath)) {
          candidates.push(fullPath);
        }
      }
    }
  } catch (err) {
    console.error("[projectDetector] scan failed:", err.message);
  }
  
  return candidates;
}

module.exports = { detectUnregisteredFolders, isProject };
```

---

### `server/routes/proxy.js` (update: PROXY_PREFIXES)

**Analog:** `server/routes/proxy.js` (lines 2-13)

**Update pattern** (add new project routes to the allow-list):
```javascript
const PROXY_PREFIXES = [
  '/api/sessions',
  '/api/agents',
  '/api/events',
  '/api/stats',
  '/api/analytics',
  '/api/pricing',
  '/api/config',
  '/api/services',
  '/api/app-settings',
  '/api/webhooks',
  // Phase 51: new project creation + import routes
  '/api/projects',
];
```

---

## Shared Patterns

### Project Config Registration (used by both create and import)

**Source:** `server/routes/gsd.js` (lines 27-36, 94-100)

**Pattern** (load → mutate → save config):
```javascript
function loadConfig() {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, "../../gsd-projects.json");
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw);
}

function saveConfig(config) {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, '../../gsd-projects.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

// In create/import handler:
const config = loadConfig();
const projects = config.projects || [];
projects.push({
  name: projectName,
  root: projectRoot,
  tmux_session: sessionName,
  services: [
    { name: 'GitHub', statusUrl: 'https://status.github.com/api/v2/status.json' },
    { name: 'Claude', statusUrl: 'https://status.anthropic.com/api/v2/status.json' }
  ]
});
saveConfig({ ...config, projects });
```

### Terminal Session Launch + Auto-Send First Message

**Source:** `server/routes/terminal.js` (lines 14-52, 66-77)

**Pattern** (create tmux session, auto-launch Claude, detect ready, send slash-command):
```javascript
// After GSD scaffolding completes:
// 1. Create tmux session with Claude Code
const sessionName = sanitizeName(projectName);
const sessionCmd = `tmux new-session -d -s ${sessionName} -x 200 -y 50`;
// pty.write(sessionCmd);

// 2. Detect when Claude's prompt is ready (use phase 46 heuristic)
// Via WebSocket polling or stateBroadcaster watching for ready marker

// 3. Send first message
const sendKeysCmd = `tmux send-keys -t ${sessionName} '/gsd-new-project' Enter`;
// pty.write(sendKeysCmd);
```

### API Response Consistency

**Source:** `server/routes/services.js`, `server/routes/gsd.js`

**Pattern** (always include error details in response):
```javascript
// Success
res.json({ ok: true, data: {...} });

// Error with detail
res.status(400).json({
  error: "Plain English message visible to user",
  detail: err.message // For logging/debugging
});
```

### State Broadcaster Integration

**Source:** `server/gsd/stateBroadcaster.js` (state push pattern)

**Pattern** (emit project state changes for UI updates):
```javascript
// When creation step completes:
const { getProjectStateSnapshot } = require('../gsd/stateBroadcaster');
const snapshot = getProjectStateSnapshot(projectName);
// Broadcast via WebSocket: { type: 'project_state_change', project: projectName, ...snapshot }
```

---

## No Analog Found

No files required completely new patterns. All code builds on existing analogs:

| Category | Reason | Resolution |
|----------|--------|-----------|
| Creation pipeline state machine | New feature | Schema defined in CONTEXT.md D-12, implemented in `creation_state` table + project route handlers |
| GitHub repo creation (gh CLI) | External tool | Document as shell subprocess in `projects.js` route handler |
| PAT pre-flight gate logic | UI flow check | Implemented in React component using API lookup of `app-settings` secrets |

---

## Metadata

**Analog search scope:** 
- `/data/home/gsddashboard/server/routes/*.js` (13 files)
- `/data/home/gsddashboard/client/src/components/*.tsx` (20+ files)
- `/data/home/gsddashboard/server/db.js` (schema + migration patterns)
- `/data/home/gsddashboard/scripts/*.js` (file/GSD install patterns)

**Files scanned:** 150+
**Pattern extraction date:** 2026-04-20
