# Phase 59: Task Backend Migration + GitHub Issues Link — Pattern Map

**Mapped:** 2026-05-28
**Files analyzed:** 7 new/modified files
**Analogs found:** 7 / 7 (100% match rate)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `client/src/lib/types.ts` | type definition | request-response | `client/src/lib/types.ts` (self) | exact |
| `server/gsd/taskMigration.js` | service/utility | CRUD + shell exec | `server/gsd/projectScaffold.js` | exact |
| `server/routes/gsd.js` (modification) | controller route | request-response + CRUD | `server/routes/gsd.js` lines 505–568 (stage transition) | exact |
| `client/src/components/StageTransitionModal.tsx` (modification) | component | request-response | `client/src/components/StageTransitionModal.tsx` (self) | exact |
| `client/src/components/TasksTab.tsx` (modification) | component | CRUD + conditional render | `client/src/components/TasksTab.tsx` (self) | exact |
| `client/src/components/MigrationStep.tsx` | component (new) | request-response | `client/src/components/StageTransitionModal.tsx` | role-match |
| `server/__tests__/task-migration.test.js` | test | verification | `server/__tests__/*.test.js` (existing patterns) | role-match |

---

## Pattern Assignments

### 1. `client/src/lib/types.ts` (type definition, request-response)

**Analog:** `client/src/lib/types.ts` (self, lines 127–167 — GsdProject interface)

**Purpose:** Add `task_backend`, `github_repo`, and `taskMigratedAt` fields to `GsdProject` type.

**Imports pattern** (lines 1–5):
```typescript
// No new imports needed; types.ts has no imports (pure type definitions)
```

**Core addition** — extend GsdProject interface (after line 166, before closing brace):
```typescript
export interface GsdProject {
  // ... existing fields (name, root, stage, stageUpdatedAt, etc.)
  
  /** Phase 59: task backend source ('dashboard' or 'github'). Defaults to 'dashboard'. */
  task_backend?: 'dashboard' | 'github';
  /** Phase 59: GitHub repository URL (e.g., 'https://github.com/owner/repo') */
  github_repo?: string | null;
  /** Phase 59: ISO timestamp of task migration to GitHub. Set when task_backend flips to 'github'. */
  taskMigratedAt?: string | null;
}
```

**Rationale:** Mirrors Phase 58 pattern of adding `stage` + `stageUpdatedAt` fields to GsdProject (lines 162–164). Same structure: optional field with default and timestamp tracking.

---

### 2. `server/gsd/taskMigration.js` (service/utility, CRUD + shell exec) — NEW FILE

**Analog:** `server/gsd/projectScaffold.js` (project creation with execFileAsync pattern)

**Purpose:** Core logic for task export, snapshot creation, GitHub repo detection, and rollback restore.

**Imports pattern** (lines 1–15):
```javascript
// Source: server/gsd/projectScaffold.js lines 1–30 + server/routes/gsd.js lines 1–16
const fs = require('fs').promises; // for snapshot write/read
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { db } = require('../db'); // for task queries
const { getSecret } = require('../crypto'); // for GitHub PAT (Phase 45 pattern)
```

**Function 1: detectRepoUrl (lines 20–40)** — Find GitHub repo from git remote:
```javascript
// Source: Inspired by Phase 51 git operations in projectScaffold.js
async function detectRepoUrl(projectRoot) {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd: projectRoot,
      timeout: 5000,
    });
    const url = stdout.trim();
    // origin returns the name if not set, so verify it's a real URL
    if (url && url !== 'origin' && url.includes('github.com')) {
      return url;
    }
    return null;
  } catch (err) {
    return null; // No git repo, no remote, or permission denied — non-fatal
  }
}
```

**Function 2: createSnapshot (lines 42–70)** — Save pre-migration task snapshot:
```javascript
// Source: Phase 42 config exports + Phase 45 secret backups pattern
async function createSnapshot(projectRoot, projectName) {
  try {
    const tasks = db.prepare(
      'SELECT id, title, description, archived, created_at FROM project_tasks WHERE project_key = ? AND archived = 0'
    ).all(projectName);

    const snapshot = {
      projectName,
      exportedAt: new Date().toISOString(),
      taskCount: tasks.length,
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        created_at: t.created_at,
      })),
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
    const filename = `.dashboard-task-snapshot-${timestamp}.json`;
    const filepath = path.join(projectRoot, filename);

    await fs.writeFile(filepath, JSON.stringify(snapshot, null, 2), 'utf8');
    return filepath;
  } catch (err) {
    throw new Error(`Snapshot creation failed: ${err.message}`);
  }
}
```

**Function 3: extractRepoFromUrl (lines 72–90)** — Parse GitHub URL to owner/repo:
```javascript
// Source: Phase 59 RESEARCH.md Pitfall 3 pattern
function extractRepoFromUrl(url) {
  // Handles: https://github.com/owner/repo, https://github.com/owner/repo.git,
  // git@github.com:owner/repo.git, etc.
  const match = url.match(
    /(?:https?:\/\/|git@)github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i
  );
  if (match) {
    return `${match[1]}/${match[2]}`;
  }
  return null;
}
```

**Function 4: exportTasks (lines 92–130)** — Create GitHub issues for each task:
```javascript
// Source: Inspired by projectScaffold.js github_create step logic
async function exportTasks(options) {
  const { projectName, projectRoot, repoUrl, githubPat } = options;
  const exported = [];
  const failed = [];

  try {
    const tasks = db.prepare(
      'SELECT id, title, description, created_at FROM project_tasks WHERE project_key = ? AND archived = 0'
    ).all(projectName);

    for (const task of tasks) {
      try {
        const body = `ID: task-${task.id}\nCreated: ${task.created_at}\n\n${task.description || '(no description)'}`;
        
        const { stdout } = await execFileAsync('gh', [
          'issue', 'create',
          '--repo', repoUrl,
          '--title', task.title,
          '--body', body,
          '--label', 'source:dashboard-migration',
        ], {
          timeout: 15000,
          env: { ...process.env, GH_TOKEN: githubPat },
        });

        const match = stdout.match(/\/issues\/(\d+)/);
        if (match) {
          exported.push({ task_id: task.id, issue_number: match[1] });
        }
      } catch (err) {
        failed.push({ task_id: task.id, error: err.message });
      }
    }
  } catch (err) {
    throw new Error(`Task export failed: ${err.message}`);
  }

  return { exported, failed };
}
```

**Function 5: restoreSnapshot (lines 132–160)** — Rollback: restore tasks from snapshot file:
```javascript
// Source: Follows Phase 42 config import pattern
async function restoreSnapshot(projectRoot, projectName) {
  try {
    // Find the most recent snapshot file
    const files = await fs.readdir(projectRoot);
    const snapshots = files
      .filter(f => f.startsWith('.dashboard-task-snapshot-') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (snapshots.length === 0) {
      throw new Error('No task snapshot found for rollback');
    }

    const snapshotPath = path.join(projectRoot, snapshots[0]);
    const raw = await fs.readFile(snapshotPath, 'utf8');
    const snapshot = JSON.parse(raw);

    // Restore tasks from snapshot into project_tasks table
    for (const task of snapshot.tasks) {
      db.prepare(
        'INSERT INTO project_tasks (project_key, title, description, archived, created_at) VALUES (?, ?, ?, 0, ?)'
      ).run(projectName, task.title, task.description, task.created_at);
    }

    return snapshot;
  } catch (err) {
    throw new Error(`Snapshot restore failed: ${err.message}`);
  }
}
```

**Exports** (line 162):
```javascript
module.exports = {
  detectRepoUrl,
  createSnapshot,
  extractRepoFromUrl,
  exportTasks,
  restoreSnapshot,
};
```

---

### 3. `server/routes/gsd.js` (modification, controller route, request-response)

**Analog:** `server/routes/gsd.js` lines 505–568 (PATCH /projects/:name/stage — stage transition route)

**Purpose:** Add two new POST routes for task migration and rollback.

**Route 1: POST /api/gsd/projects/:name/migrate** (NEW, after line 568)

**Pattern** (lines 505–520 from gsd.js are the model):
```javascript
// Source: server/routes/gsd.js lines 505–568 (stage transition pattern)
router.post('/projects/:name/migrate', async (req, res) => {
  if (GSD_DATA_URL) {
    // Proxy mode (Railway): forward to upstream
    upstreamFetch(`${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(req.params.name)}/migrate`,
      { method: 'POST', body: JSON.stringify(req.body), signal: AbortSignal.timeout(30000) })
      .then(r => r.json().then(d => res.status(r.status).json(d)))
      .catch(err => res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message }));
    return;
  }

  const { name } = req.params;
  try {
    // 1. Load project from config
    const config = loadConfigWithBackfill();
    const projectIndex = (config.projects || []).findIndex(p => p.name === name);
    if (projectIndex === -1) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const project = config.projects[projectIndex];
    
    // 2. Prevent migration of Dashboard itself
    if (name === 'gsddashboard') {
      return res.status(422).json({ error: 'GSD Dashboard cannot migrate its own tasks' });
    }

    // 3. Prevent re-migration
    if (project.task_backend === 'github') {
      return res.status(409).json({ error: 'Tasks already migrated to GitHub' });
    }

    // 4. Detect GitHub repo URL
    const { detectRepoUrl } = require('../gsd/taskMigration');
    const repoUrl = await detectRepoUrl(project.root);
    if (!repoUrl) {
      return res.status(400).json({ error: 'No GitHub remote found in git config' });
    }

    // 5. Create snapshot BEFORE any writes
    const { createSnapshot } = require('../gsd/taskMigration');
    const snapshotPath = await createSnapshot(project.root, name);

    // 6. Export tasks to GitHub
    const { exportTasks } = require('../gsd/taskMigration');
    const githubPat = getSecret('github_pat');
    if (!githubPat) {
      return res.status(422).json({ error: 'GitHub PAT not configured' });
    }

    const result = await exportTasks({
      projectName: name,
      projectRoot: project.root,
      repoUrl,
      githubPat,
    });

    // 7. Update project state only if all tasks succeeded
    if (result.failed.length === 0) {
      project.task_backend = 'github';
      project.github_repo = repoUrl;
      project.taskMigratedAt = new Date().toISOString();
      saveConfig(config);
      
      // Broadcast state change (Phase 58 pattern)
      const { broadcast } = require('../websocket');
      broadcast('task_backend_change', {
        project: name,
        task_backend: 'github',
        github_repo: repoUrl,
        taskMigratedAt: project.taskMigratedAt,
      });
    }

    res.json({
      success: result.failed.length === 0,
      exported: result.exported.length,
      failed: result.failed,
      snapshotPath,
    });
  } catch (err) {
    res.status(500).json({ error: 'Migration failed', detail: err.message.split('\n')[0] });
  }
});
```

**Route 2: POST /api/gsd/projects/:name/rollback-migration** (NEW, after migration route)

**Pattern** (same error handling as stage transition):
```javascript
// Source: server/routes/gsd.js error handling pattern lines 565–567
router.post('/projects/:name/rollback-migration', async (req, res) => {
  if (GSD_DATA_URL) {
    upstreamFetch(`${GSD_DATA_URL}/api/gsd/projects/${encodeURIComponent(req.params.name)}/rollback-migration`,
      { method: 'POST', body: JSON.stringify(req.body), signal: AbortSignal.timeout(30000) })
      .then(r => r.json().then(d => res.status(r.status).json(d)))
      .catch(err => res.status(502).json({ error: 'Failed to reach GSD data source', detail: err.message }));
    return;
  }

  const { name } = req.params;
  try {
    const config = loadConfigWithBackfill();
    const projectIndex = (config.projects || []).findIndex(p => p.name === name);
    if (projectIndex === -1) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = config.projects[projectIndex];

    // 1. Check if project is in 'github' backend
    if (project.task_backend !== 'github') {
      return res.status(400).json({ error: 'Project is not using GitHub backend' });
    }

    // 2. Check 7-day window
    const migratedAt = new Date(project.taskMigratedAt);
    const now = new Date();
    const daysSinceMigration = (now - migratedAt) / (1000 * 60 * 60 * 24);
    if (daysSinceMigration > 7) {
      return res.status(410).json({ error: 'Rollback window (7 days) has expired' });
    }

    // 3. Restore tasks from snapshot
    const { restoreSnapshot } = require('../gsd/taskMigration');
    await restoreSnapshot(project.root, name);

    // 4. Flip task_backend back to 'dashboard'
    project.task_backend = 'dashboard';
    project.github_repo = null;
    project.taskMigratedAt = null;
    saveConfig(config);

    // Broadcast state change
    const { broadcast } = require('../websocket');
    broadcast('task_backend_change', {
      project: name,
      task_backend: 'dashboard',
      github_repo: null,
    });

    res.json({ success: true, task_backend: 'dashboard' });
  } catch (err) {
    res.status(500).json({ error: 'Rollback failed', detail: err.message.split('\n')[0] });
  }
});
```

**Error handling pattern** (reuses lines 565–567 from stage transition):
- `res.status(500).json({ error: '...', detail: err.message.split('\n')[0] })`
- Matches existing error response format in gsd.js

---

### 4. `client/src/lib/api.ts` (modification, request-response)

**Analog:** `client/src/lib/api.ts` lines 171–179 (stageTransition + validateStageTransition API methods)

**Purpose:** Add two new API methods to `api.gsd` namespace for task migration and rollback.

**Imports pattern** (already present, lines 1–25):
```typescript
// No new imports needed; uses existing request() helper and types from types.ts
```

**Core additions** — extend api.gsd object (after line 179, within gsd namespace):
```typescript
// Source: client/src/lib/api.ts lines 171–179 (stageTransition pattern)
export const api = {
  // ... existing properties ...
  gsd: {
    // ... existing methods ...
    stageTransition: (projectName: string, targetStage: ProjectStage) => /* ... */,
    validateStageTransition: (projectName: string, targetStage: ProjectStage) => /* ... */,
    
    // NEW methods (Phase 59)
    migrateTasksToGithub: (projectName: string) =>
      request<{ success: boolean; exported: number; failed: Array<{ task_id: number; error: string }>; snapshotPath: string }>(
        `/gsd/projects/${encodeURIComponent(projectName)}/migrate`,
        { method: 'POST', body: JSON.stringify({}) }
      ),
    
    rollbackTaskMigration: (projectName: string) =>
      request<{ success: boolean; task_backend: 'dashboard' }>(
        `/gsd/projects/${encodeURIComponent(projectName)}/rollback-migration`,
        { method: 'POST', body: JSON.stringify({}) }
      ),
  },
};
```

**Rationale:** Mirrors `stageTransition` pattern (line 171–175): POST to `/gsd/projects/{name}/{action}`, method='POST', typed response, URL-encoded project name.

---

### 5. `client/src/components/StageTransitionModal.tsx` (modification, request-response)

**Analog:** `client/src/components/StageTransitionModal.tsx` lines 14–100 (existing modal structure with step-based flow)

**Purpose:** Inject a migration step into the stage transition flow when transitioning Beta → Launched.

**Imports pattern** (existing, lines 1–4):
```typescript
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { GsdProject, ProjectStage, StageValidationResult } from "../lib/types";
import { StageBadge } from "./StageBadge";
```

**State additions** — extend useState hooks (after line 24, before useEffect):
```typescript
// Source: StageTransitionModal.tsx existing state pattern (lines 21–24)
const [migrationStep, setMigrationStep] = useState<'prompt' | 'running' | 'done' | null>(null);
const [migrationError, setMigrationError] = useState<string | null>(null);
const [migrationResult, setMigrationResult] = useState<{ exported: number; failed: number } | null>(null);
```

**Effect to detect Beta→Launched** (NEW, after line 49):
```typescript
// Source: useEffect pattern from lines 26–49 (validation effect)
useEffect(() => {
  if (gates?.valid && targetStage === 'launched' && project.stage === 'beta') {
    // Only show migration step for beta->launched with a git remote
    setMigrationStep('prompt');
  }
}, [gates?.valid, targetStage, project.stage]);
```

**Handler: handleMigrate** (NEW, after line 73):
```typescript
// Source: handleConfirm pattern (lines 61–73)
async function handleMigrate() {
  setMigrationStep('running');
  setMigrationError(null);
  try {
    const result = await api.gsd.migrateTasksToGithub(project.name);
    setMigrationResult({ exported: result.exported, failed: result.failed.length });
    setMigrationStep('done');
    // Continue to stage transition after brief pause
    setTimeout(() => handleConfirm(), 1000);
  } catch (err) {
    setMigrationError(err instanceof Error ? err.message : 'Migration failed');
    setMigrationStep('prompt'); // Allow retry
  }
}
```

**Handler: handleSkip** (NEW, after handleMigrate):
```typescript
// Source: None (new logic) but follows handleConfirm pattern
function handleSkip() {
  setMigrationStep(null);
  handleConfirm(); // Proceed with stage transition without migration
}
```

**Conditional render** (modify return JSX, after existing gates display, ~line 110):
```typescript
// Source: TasksTab.tsx conditional render pattern (TasksTab lines 288–330)
{migrationStep === 'prompt' && (
  <div className="space-y-4">
    <h3 className="font-semibold">Migrate tasks to GitHub</h3>
    <p className="text-sm text-gray-400">
      Back up your tasks to GitHub Issues before launching. You can skip this and migrate later.
    </p>
    {migrationError && <p className="text-sm text-red-400">{migrationError}</p>}
    <div className="flex gap-2">
      <button onClick={handleMigrate} disabled={isConfirming} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
        Migrate
      </button>
      <button onClick={handleSkip} disabled={isConfirming} className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50">
        Skip
      </button>
    </div>
  </div>
)}
{migrationStep === 'running' && (
  <div className="space-y-2 text-center">
    <p className="text-sm font-medium">Exporting tasks to GitHub...</p>
    <div className="h-1 bg-gray-700 rounded overflow-hidden">
      <div className="h-full bg-blue-600 animate-pulse" />
    </div>
  </div>
)}
{migrationStep === 'done' && (
  <div className="space-y-2 text-center">
    <p className="text-sm text-green-400">Tasks migrated: {migrationResult?.exported} exported</p>
    {migrationResult?.failed > 0 && (
      <p className="text-sm text-yellow-400">{migrationResult.failed} tasks could not be migrated</p>
    )}
  </div>
)}
```

**Rationale:** Follows existing multi-step pattern in StageTransitionModal (gates → confirm). Migration step inserts before the final stage write. Uses same error state and disabled patterns.

---

### 6. `client/src/components/TasksTab.tsx` (modification, CRUD + conditional render)

**Analog:** `client/src/components/TasksTab.tsx` lines 1–100+ (existing task list component)

**Purpose:** Replace task list with GitHub link panel when `task_backend === 'github'`.

**Imports pattern** (existing, lines 1–4):
```typescript
import { useState, useEffect, useRef } from "react";
import { Archive, ArchiveRestore, ClipboardCopy, GripVertical, Pencil, Plus, ExternalLink } from "lucide-react";
import { api } from "../lib/api";
import type { GsdTask, GsdProject } from "../lib/types";
```

**Helper functions** (NEW, before TaskRow component):
```typescript
// Source: Custom logic (new to Phase 59)
function extractOrgRepoFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

function isWithin7Days(timestamp: string | null | undefined): boolean {
  if (!timestamp) return false;
  const migrationDate = new Date(timestamp);
  const now = new Date();
  const daysSince = (now.getTime() - migrationDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince < 7;
}
```

**Conditional render** (modify component return, after line 87):
```typescript
// Source: TasksTab.tsx existing component + TasksTab conditional pattern from RESEARCH.md
export function TasksTab({ project }: { project: GsdProject }) {
  // ... existing state (tasks, showArchived, etc.) ...

  // NEW: Handle GitHub backend rendering
  if (project.task_backend === 'github') {
    return (
      <div className="space-y-4 p-6 border border-border rounded-lg bg-gray-950/30">
        <h3 className="text-lg font-semibold">Tasks moved to GitHub</h3>
        <p className="text-sm text-gray-400">
          Tasks are now managed as issues in your GitHub repository.
        </p>
        <a
          href={`https://github.com/${extractOrgRepoFromUrl(project.github_repo)}/issues`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Open GitHub Issues <ExternalLink className="w-4 h-4" />
        </a>

        {isWithin7Days(project.taskMigratedAt) && (
          <button
            onClick={() => handleRollback()}
            className="block mt-4 text-xs text-gray-500 hover:text-gray-300 underline"
          >
            Roll back migration
          </button>
        )}
      </div>
    );
  }

  // Existing task list rendering (unchanged)
  return (
    <div className="space-y-4">
      {/* existing task input, task list, etc. */}
      {/* ... existing code from line 87+ ... */}

      {/* NEW: Show "Migrate to GitHub" button if no migration yet and project is launched */}
      {!project.task_backend && project.stage === 'launched' && (
        <button
          onClick={() => handleMigrateLater()}
          className="text-sm text-blue-400 hover:text-blue-300 underline"
        >
          Migrate tasks to GitHub
        </button>
      )}
    </div>
  );
}
```

**Handlers** (NEW, within component before return):
```typescript
// Source: handleMigrate pattern from StageTransitionModal
async function handleMigrateLater() {
  try {
    await api.gsd.migrateTasksToGithub(project.name);
    // Trigger project refresh (parent component will refetch via websocket)
  } catch (err) {
    console.error('Migration failed:', err.message);
  }
}

async function handleRollback() {
  if (!confirm('Roll back migration? Tasks will be restored to the Dashboard.')) return;
  try {
    await api.gsd.rollbackTaskMigration(project.name);
    // Trigger project refresh
  } catch (err) {
    console.error('Rollback failed:', err.message);
  }
}
```

**Rationale:** Follows existing conditional render pattern in ProjectCard (uses `stage` field to show/hide UI). TasksTab now has two branches: dashboard tasks or GitHub link. Both are non-breaking — dashboard branch is unchanged.

---

### 7. `client/src/components/MigrationStep.tsx` (component, request-response) — OPTIONAL NEW FILE

**Analog:** `client/src/components/StageTransitionModal.tsx` (multi-step modal structure)

**Purpose:** Extract migration step UI into reusable subcomponent (optional refactoring for clarity; can also inline in StageTransitionModal).

**If extracted to separate file** (not strictly required, but recommended for readability):

```typescript
// Source: StageTransitionModal.tsx pattern (lines 60–73, error handling)
import { useState } from 'react';
import { api } from '../lib/api';
import type { GsdProject } from '../lib/types';

interface MigrationStepProps {
  project: GsdProject;
  onMigrationDone: () => void;
  onSkip: () => void;
  isDisabled?: boolean;
}

export function MigrationStep({
  project,
  onMigrationDone,
  onSkip,
  isDisabled = false,
}: MigrationStepProps) {
  const [step, setStep] = useState<'prompt' | 'running' | 'done'>('prompt');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ exported: number; failed: number } | null>(null);

  async function handleMigrate() {
    setStep('running');
    setError(null);
    try {
      const res = await api.gsd.migrateTasksToGithub(project.name);
      setResult({ exported: res.exported, failed: res.failed.length });
      setStep('done');
      setTimeout(onMigrationDone, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Migration failed');
      setStep('prompt');
    }
  }

  // Conditional JSX (same as inline version above)
  // ... render logic ...
}
```

**Note:** This component is optional. For Phase 59, it's simpler to inline the migration UI directly in StageTransitionModal to avoid prop threading. If StageTransitionModal becomes too large in future, extract to `MigrationStep.tsx`.

---

### 8. `server/__tests__/task-migration.test.js` (test, verification) — OPTIONAL NEW FILE

**Analog:** `server/routes/__tests__/gsd-pause-session.test.js` (existing test pattern for gsd routes)

**Purpose:** Unit tests for task migration logic (execFileAsync mocking, snapshot creation, rollback).

**Test structure** (high-level pattern only; detailed assertions follow project's existing test style):
```javascript
// Source: server/__tests__/* test patterns (Node.js test framework)
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs').promises;
const { db } = require('../db');

describe('Task Migration (Phase 59)', () => {
  describe('detectRepoUrl', () => {
    test('returns GitHub URL when git remote is set', async () => {
      // Mock execFileAsync to return a GitHub URL
      // Assert that detectRepoUrl() returns the URL
    });

    test('returns null when git remote is not set', async () => {
      // Mock execFileAsync to return empty string
      // Assert that detectRepoUrl() returns null
    });
  });

  describe('createSnapshot', () => {
    test('creates .json snapshot with all open tasks', async () => {
      // Insert test tasks into project_tasks
      // Call createSnapshot()
      // Assert file exists and contains correct tasks
    });

    test('excludes archived tasks from snapshot', async () => {
      // Insert mix of open/archived tasks
      // Call createSnapshot()
      // Assert snapshot.tasks only includes open tasks
    });
  });

  describe('exportTasks', () => {
    test('calls gh issue create for each task', async () => {
      // Mock execFileAsync
      // Call exportTasks()
      // Assert execFileAsync was called with gh issue create
    });

    test('returns failed tasks when gh CLI fails', async () => {
      // Mock execFileAsync to fail for one task
      // Call exportTasks()
      // Assert failed array contains the failed task
    });
  });

  describe('restoreSnapshot', () => {
    test('restores tasks from snapshot file', async () => {
      // Create snapshot file in test project dir
      // Call restoreSnapshot()
      // Assert tasks are inserted into project_tasks table
    });

    test('throws error when no snapshot exists', async () => {
      // Call restoreSnapshot() on project with no snapshot
      // Assert throws error
    });
  });

  describe('POST /api/gsd/projects/:name/migrate', () => {
    test('migrates tasks and sets task_backend to github', async () => {
      // Mock detectRepoUrl, createSnapshot, exportTasks
      // POST to /api/gsd/projects/test-project/migrate
      // Assert project.task_backend === 'github' in config
      // Assert response.success === true
    });

    test('returns 400 when no git remote found', async () => {
      // Mock detectRepoUrl to return null
      // POST to /api/gsd/projects/test-project/migrate
      // Assert status 400
    });

    test('returns 422 when project already migrated', async () => {
      // Set project.task_backend = 'github' in config
      // POST to /api/gsd/projects/test-project/migrate
      // Assert status 409 (conflict)
    });

    test('returns 422 for gsddashboard project', async () => {
      // POST to /api/gsd/projects/gsddashboard/migrate
      // Assert status 422 (locked decision D-12)
    });
  });

  describe('POST /api/gsd/projects/:name/rollback-migration', () => {
    test('restores tasks from snapshot and flips task_backend', async () => {
      // Set up project with task_backend='github' and snapshot
      // POST to /api/gsd/projects/test-project/rollback-migration
      // Assert project.task_backend === 'dashboard' in config
      // Assert tasks restored from snapshot
    });

    test('returns 410 when 7-day window expired', async () => {
      // Set taskMigratedAt to 8 days ago
      // POST to /api/gsd/projects/test-project/rollback-migration
      // Assert status 410 (gone)
    });

    test('returns 400 when not in github backend', async () => {
      // Set project.task_backend = 'dashboard' (default)
      // POST to /api/gsd/projects/test-project/rollback-migration
      // Assert status 400
    });
  });
});
```

**Note:** Full test implementation follows project's test setup (Node.js test framework in `server/__tests__/`). Focus on mocking execFileAsync and fs operations to avoid real git/gh calls.

---

## Shared Patterns

### Error Handling (Apply to all routes)

**Source:** `server/routes/gsd.js` lines 565–567 (stage transition error pattern)

**Pattern:**
```javascript
// Consistent error response format
res.status(500).json({ error: 'Operation failed', detail: err.message.split('\n')[0] });
```

**Apply to:** Both POST /migrate and POST /rollback-migration routes.

---

### Config Read/Write (Apply to all routes)

**Source:** `server/routes/gsd.js` lines 38–61 (loadConfig, saveConfig, loadConfigWithBackfill)

**Pattern:**
```javascript
// Load → backfill → modify → save
const config = loadConfigWithBackfill();
const project = config.projects.find(p => p.name === req.params.name);
project.field = value;
saveConfig(config);
```

**Apply to:** Both POST routes that update gsd-projects.json.

---

### GsdProject Field Defaults (Apply to type system)

**Source:** `server/routes/gsd.js` lines 52–59 (backfill pattern for `stage` field)

**Pattern:**
```javascript
// Backfill missing fields when loading config
for (const p of (config.projects || [])) {
  if (!p.stage) {
    p.stage = 'draft';
    p.stageUpdatedAt = new Date().toISOString();
  }
  if (!p.task_backend) {
    p.task_backend = 'dashboard'; // Phase 59 addition
  }
}
```

**Apply to:** `loadConfigWithBackfill()` in gsd.js (add task_backend check).

---

### WebSocket Broadcasting (Apply to routes that change state)

**Source:** `server/routes/gsd.js` line 552–553 (broadcast on stage change)

**Pattern:**
```javascript
const { broadcast } = require('../websocket');
broadcast('project_stage_change', { project: req.params.name, from: currentStage, to: targetStage, timestamp: project.stageUpdatedAt });
```

**Apply to:** Both POST /migrate and POST /rollback-migration routes after successful state update.

---

## No Analog Found

All files have clear analogs in the existing codebase. No files require fallback to RESEARCH.md patterns.

---

## Metadata

**Analog search scope:** 
- `server/routes/gsd.js` (stage transition pattern)
- `server/routes/projects.js` (execFileAsync pattern, getSecret usage)
- `server/gsd/projectScaffold.js` (shell exec pattern)
- `client/src/components/StageTransitionModal.tsx` (multi-step modal pattern)
- `client/src/components/TasksTab.tsx` (conditional render pattern)
- `client/src/lib/types.ts` (type definition pattern)
- `client/src/lib/api.ts` (API method pattern)

**Files scanned:** 50+ source files (routes, components, services, utilities)

**Pattern extraction date:** 2026-05-28

**Confidence level:** HIGH
- Stage transition and project state patterns fully verified in existing Phase 58 code
- execFileAsync and git command patterns established in projectScaffold.js
- getSecret() pattern from Phase 45 (GitHub PAT encryption)
- WebSocket broadcast pattern verified in stateBroadcaster.js
- React component patterns (hooks, conditional render) verified in StageTransitionModal and TasksTab
- All error handling and config I/O patterns are direct copies from existing gsd.js routes

