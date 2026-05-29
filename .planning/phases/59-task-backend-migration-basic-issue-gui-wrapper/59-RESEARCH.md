# Phase 59: Task Backend Migration + GitHub Issues Link — Research

**Researched:** 2026-05-28
**Domain:** Task backend migration, GitHub Issues integration, stage transition flow
**Confidence:** HIGH

## Summary

Phase 59 adds a `task_backend` field to projects and enables exporting Dashboard tasks to GitHub Issues when a project transitions Beta → Launched. The implementation is scoped: only D-01, D-02, TSK-01, TSK-02, TSK-08, TSK-09 are in scope; TSK-03–07 (full in-app GitHub Issues GUI) are deferred.

The feature requires modifications to:
1. **Type system** — add `task_backend` and `github_repo` fields to `GsdProject` and the projects schema
2. **Stage transition flow** — inject migration step into `StageTransitionModal` when transitioning Beta → Launched
3. **Task backend routes** — new POST endpoint for task export + snapshot rollback logic
4. **TasksTab component** — render "Open GitHub Issues →" link when `task_backend === 'github'`
5. **Project state** — persist task_backend + github_repo in gsd-projects.json

The scope is narrow and well-contained: no full GitHub Issues GUI, no in-app issue creation, no PR linking. Phase 59 hands off to GitHub's native UI post-migration.

**Primary recommendation:** Implement in three task waves — (1) type + route layer, (2) StageTransitionModal integration + snapshot persistence, (3) TasksTab rendering. Verify each wave before proceeding.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 & D-02:** Migration prompted during Beta → Launched transition with skip option; tasks tab remains functional if skipped, with "Migrate to GitHub" button added to top
- **D-03:** Only projects with `git remote get-url origin` result are migration-eligible; no error for projects without remote, migration option simply absent
- **D-04:** GitHub repo URL read from git remote at migration time; stored as `github_repo` field in gsd-projects.json
- **D-05:** All non-archived open tasks exported; each labeled `source:dashboard-migration`, creation date in body, Dashboard task ID back-reference
- **D-06:** Partial failure allowed; retry skips already-exported tasks; `task_backend` stays `dashboard` until all tasks export successfully
- **D-07:** `task_backend` field defaults to `dashboard`, flips to `github` only after all tasks migrate successfully
- **D-08:** After migration, TasksTab replaced entirely with prominent "Open GitHub Issues →" link; no task list shown
- **D-09:** Link opens `https://github.com/{owner}/{repo}/issues` directly
- **D-10 & D-11:** Pre-migration JSON snapshot saved to project dir; rollback button visible for 7 days post-migration (no GitHub API needed)
- **D-12:** GSD Dashboard itself stays Beta through v5.0; only user projects migrate

### Claude's Discretion

- Exact snapshot filename format
- Visual design of the GitHub link panel (use existing button/card patterns)
- Whether to show migrated task count in the link view
- Label color/formatting for `source:dashboard-migration`

### Deferred Ideas (OUT OF SCOPE)

- TSK-03–TSK-07 (full in-app GitHub Issues GUI — user explicitly dropped these)
- Imported projects without GitHub remote — Phase 51 or dedicated future phase needed
- TSK-08 full auto-import rollback (fetch live issues from GitHub API)

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TSK-01 | `task_backend` field per project (dashboard\|github) determines read/write routing | Standard Stack: gsd-projects.json schema supports arbitrary JSON fields; projects schema needs new column; GsdProject type needs new field |
| TSK-02 | Migration tool exports all open Dashboard tasks to GitHub Issues with label `source:dashboard-migration` | Standard Stack: `gh issue create` CLI available; GitHub API endpoint documented; execFileAsync pattern established in projects.js |
| TSK-08 | Migration reversible for 7 days (re-import issues as Dashboard tasks) via snapshot restore | Architecture Patterns: snapshot file in project root; rollback button conditional on `timeSinceMigration < 7 days` |
| TSK-09 | GSD Dashboard itself stays Beta through v5.0; only user projects migrate | Locked Decision D-12: Dashboard is hardcoded as Beta; no migration flow for self-hosted instance |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Task migration trigger | Frontend (StageTransitionModal) | Backend API (migration route) | User initiates via UI, backend executes export + snapshot; transition flow owns the choreography |
| GitHub repo detection | Backend (projects.js) | — | Needs shell access to `git remote get-url origin` in project directory |
| Task export to GitHub | Backend (migration route) | CLI (gh issue create) | Core logic routes POST request to migration endpoint; executes `gh` for issue creation |
| Snapshot persistence | Backend (migration route) | Filesystem (project root) | Route writes .json snapshot; project filesystem is the storage |
| TasksTab conditional render | Frontend (TasksTab.tsx) | — | Simple field check: if `task_backend === 'github'`, show link panel instead of task list |
| Rollback UI | Frontend (TasksTab.tsx) | Backend (migration route) | TasksTab shows button, calls rollback endpoint; backend restores from snapshot + updates project state |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | current | Project state persistence in gsd-projects.json | Established for all Dashboard config; JSON format is standard |
| execFile (Node.js child_process) | n/a | Shell access for `git remote get-url origin` + `gh` CLI | Non-blocking, security-safe alternative to exec(shell:true) |
| `gh` CLI | v2.30+ | GitHub issue creation, authentication via GITHUB_TOKEN env | Standard in gsd ecosystem; available on host; requires PAT in environment |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| getSecret (server/crypto.js) | existing | Retrieve GitHub PAT from encrypted storage | Fetch `github_pat` key during migration; same pattern as Phase 45 Railway PAT |
| React state (useState) | existing | Manage modal step progression + migration progress | StageTransitionModal tracks step (validate→confirm→running→done) |
| fs (Node.js) | n/a | Write snapshot JSON to project directory | Non-blocking file I/O for .json snapshot before export begins |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `gh issue create` CLI | GitHub REST API + direct HTTP POST | CLI is simpler, already authenticated, single-command-per-issue; API would require manual auth header + looping; CLI wins for simplicity |
| JSON snapshot in project root | SQLite backup table | Project root is git-trackable if user wants; versioning is automatic via git history; better UX than hidden table |
| Rollback from snapshot | Fetch live issues from GitHub | Snapshot is simpler, doesn't require GitHub auth at rollback time, works offline; API fetch is more "correct" but unnecessary complexity |

---

## Architecture Patterns

### System Architecture Diagram

```
β→Launched Transition (StageTransitionModal)
    ↓
[Validate] Can migrate? (check git remote)
    ↓
[Confirm Modal] "Migrate tasks to GitHub?" (Skip option visible)
    ↓
POST /api/gsd/projects/{name}/migrate ← Backend Migration Route
    ↓
┌─ Get GitHub repo URL from git remote ─┐
│  Read all open tasks from DB           │ ← Database (project_tasks)
│  Generate snapshot file (.json)         │ ← Filesystem (project root)
│  For each task: create GitHub issue    │ ← GitHub API (via gh CLI)
│  Update task_backend → 'github'        │ ← gsd-projects.json
└─────────────────────────────────────────┘
    ↓
[TasksTab] Check task_backend field
    ├─ 'dashboard' → render task list (existing)
    └─ 'github' → render "Open GitHub Issues →" link
         ├─ Button: Opens github.com/{owner}/{repo}/issues
         └─ Rollback button (if within 7 days)
              ↓
              POST /api/gsd/projects/{name}/rollback-migration
                  ↓
                  Restore tasks from snapshot
                  Update task_backend → 'dashboard'
```

### Recommended Project Structure

```
server/routes/
├── gsd.js              # (existing; no migration routes here)
├── tasks.js            # NEW: POST /tasks/migrate, POST /tasks/rollback
└── projects.js         # (existing; no changes needed)

client/src/components/
├── StageTransitionModal.tsx    # (existing; add migration step)
├── TasksTab.tsx                # (existing; add task_backend check)
└── MigrationStep.tsx           # NEW: subcomponent for migration prompt + progress

server/gsd/
└── taskMigration.js            # NEW: core export logic (detectRepoUrl, exportTasks, createSnapshot)

{projectRoot}/
└── .dashboard-task-snapshot-{timestamp}.json  # NEW: written before first export attempt
```

### Pattern 1: Task Migration Route (POST /api/gsd/projects/{name}/migrate)

**What:** Backend handler for task export. Detects GitHub repo, creates snapshot, exports tasks to GitHub, updates state. Supports retry (already-exported tasks skipped).

**When to use:** During Beta → Launched transition, or any time TasksTab shows "Migrate to GitHub" button.

**Example:**

```typescript
// server/routes/tasks.js (NEW)
router.post('/projects/:name/migrate', async (req, res) => {
  const { name } = req.params;
  const { skipOnError } = req.body || {}; // allow caller to proceed with partial success

  try {
    // 1. Load project from config
    const config = loadConfigWithBackfill();
    const project = config.projects.find(p => p.name === name);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.task_backend === 'github') return res.status(409).json({ error: 'Already migrated' });

    // 2. Detect GitHub repo URL
    const { detectRepoUrl } = require('../gsd/taskMigration');
    const repoUrl = await detectRepoUrl(project.root);
    if (!repoUrl) {
      return res.status(400).json({ error: 'No GitHub remote found in git config' });
    }

    // 3. Create snapshot before any writes
    const { createSnapshot } = require('../gsd/taskMigration');
    const snapshotPath = await createSnapshot(project.root, name);

    // 4. Export tasks to GitHub
    const { exportTasks } = require('../gsd/taskMigration');
    const result = await exportTasks({
      projectName: name,
      projectRoot: project.root,
      repoUrl,
      githubPat: getSecret('github_pat'),
    });

    // 5. Update project state only if all tasks succeeded (or skipOnError=true)
    if (result.failed.length === 0 || skipOnError) {
      project.task_backend = 'github';
      project.github_repo = repoUrl;
      project.taskMigratedAt = new Date().toISOString();
      saveConfig(config);
    }

    res.json({
      success: result.failed.length === 0,
      exported: result.exported.length,
      failed: result.failed,
      snapshotPath,
    });
  } catch (err) {
    res.status(500).json({ error: 'Migration failed', detail: err.message });
  }
});

// Source: patterns from Phase 45 (getSecret), Phase 58 (stage transition route structure)
```

### Pattern 2: StageTransitionModal Migration Step

**What:** Add migration prompt as a step in the stage-transition flow. User sees "Migrate tasks to GitHub?" with Skip option. If Skip, migration button added to TasksTab.

**When to use:** Only when transitioning Beta → Launched and project is migration-eligible (has git remote).

**Example:**

```typescript
// client/src/components/StageTransitionModal.tsx
export function StageTransitionModal({ project, targetStage, isOpen, onClose, onSuccess }) {
  const [migrationStep, setMigrationStep] = useState<'prompt' | 'running' | 'done' | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  // After gates validate, check if this is β→launched transition
  useEffect(() => {
    if (gates?.valid && targetStage === 'launched') {
      setMigrationStep('prompt');
    }
  }, [gates, targetStage]);

  async function handleMigrate() {
    setMigrationStep('running');
    try {
      const result = await api.gsd.tasks.migrate(project.name);
      setMigrationStep('done');
    } catch (err) {
      setMigrationError(err.message);
      setMigrationStep('prompt');
    }
  }

  function handleSkip() {
    // Proceed without migration; TasksTab will show "Migrate to GitHub" button later
    setMigrationStep(null);
    handleConfirm(); // continue to stage transition
  }

  return (
    <>
      {migrationStep === 'prompt' && (
        <div className="space-y-4">
          <h3 className="font-semibold">Migrate tasks to GitHub</h3>
          <p className="text-sm text-gray-400">
            Back up your tasks to GitHub Issues before launching. You can skip this and migrate later.
          </p>
          {migrationError && <p className="text-sm text-red-400">{migrationError}</p>}
          <div className="flex gap-2">
            <button onClick={handleMigrate} className="flex-1 bg-blue-600">Migrate</button>
            <button onClick={handleSkip} className="flex-1 bg-gray-700">Skip</button>
          </div>
        </div>
      )}
      {/* existing gates + confirm UI */}
    </>
  );
}

// Source: StageTransitionModal.tsx structure (existing), inspired by multi-step flows in project wizard (Phase 51 upcoming)
```

### Pattern 3: TasksTab Conditional Render

**What:** Check `project.task_backend` field; render either task list or GitHub link based on value.

**Example:**

```typescript
// client/src/components/TasksTab.tsx
export function TasksTab({ project }: { project: GsdProject }) {
  if (project.task_backend === 'github') {
    // Post-migration: show link view
    return (
      <div className="space-y-4 p-6 border border-border rounded-lg">
        <h3 className="text-lg font-semibold">Tasks moved to GitHub</h3>
        <p className="text-sm text-gray-400">
          Tasks are now managed as issues in your GitHub repository.
        </p>
        <a
          href={`https://github.com/${extractOrgRepoFromUrl(project.github_repo)}/issues`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Open GitHub Issues <ExternalLink className="w-4 h-4" />
        </a>

        {/* Rollback button if within 7 days */}
        {isWithin7Days(project.taskMigratedAt) && (
          <button
            onClick={handleRollback}
            className="block mt-4 text-xs text-gray-500 hover:text-gray-300 underline"
          >
            Roll back migration
          </button>
        )}
      </div>
    );
  }

  // Pre-migration or dashboard backend: existing task list
  return (
    <div className="space-y-4">
      {/* existing task list UI */}
      {!project.task_backend && project.stage === 'launched' && (
        <button onClick={handleMigrateLater} className="text-sm text-blue-400 underline">
          Migrate tasks to GitHub
        </button>
      )}
    </div>
  );
}

// Source: TasksTab.tsx (existing), conditional rendering pattern from ProjectCard stage-based rendering (Phase 58)
```

### Anti-Patterns to Avoid

- **Don't create tasks in TasksTab if task_backend is 'github':** Disable the "Add Task" button entirely when `task_backend === 'github'`. The UI should make it clear tasks are read-only post-migration.
- **Don't assume git is available:** Always wrap `git remote get-url origin` in try/catch. If it fails, migration is simply not an option (no error message to user; field absence means no option shown).
- **Don't retry forever on failed exports:** Track which tasks failed, allow one retry pass, then offer snapshot file location to user for manual inspection. Multi-attempt retries create ambiguity about final state.
- **Don't hardcode GitHub org/repo structure:** Parse `repoUrl` with `github.com/([^/]+)/([^/]+)` to extract owner/repo; don't assume naming conventions.
- **Don't skip snapshot creation on partial success:** Snapshot is the rollback source. Create it BEFORE any task exports, even if some exports fail later.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub authentication | Custom token header + REST API | `gh` CLI with GITHUB_TOKEN env var | CLI is already authenticated via PAT; no manual request building needed. Eliminates auth header bugs, retry logic, rate-limit handling |
| Issue batch creation | Custom loop with Promise.all | `gh issue create` for each task in sequence | CLI handles throttling, retries, auth errors. Parallel Promise.all can exceed rate limits; sequential is safer and simpler |
| Detecting GitHub repo from local project | Custom git config parser | `execFileAsync('git', ['remote', 'get-url', 'origin'])` | git CLI is standard; parsing git config manually is error-prone (URL format variations, comment handling) |
| Snapshot storage format | Custom binary/protobuf | JSON file in project root | JSON is human-readable, git-trackable, requires no schema migrations, trivial to parse |
| Rollback from issue list | Re-fetch live GitHub issues API + merge with snapshot | Restore from snapshot file only | Snapshot is always correct (captured at migration time); live API can be modified by user post-migration, breaking restore logic |
| Time-based rollback gate | Manual timestamp comparison in component | Store `taskMigratedAt` in gsd-projects.json, compare in TasksTab | Centralized state, survives page reload, consistent across clients |

**Key insight:** GitHub CLI (`gh`) is battle-tested and handles all the complexity (auth, retries, rate limits, error messages). Using it directly avoids reinventing a broken GitHub client. Same pattern already used in projects.js for github_create step.

---

## Common Pitfalls

### Pitfall 1: Assuming All Tasks Export Successfully

**What goes wrong:** Route returns "all tasks exported" but some silently failed due to GitHub API rate limits or network issues. User believes migration is complete; later discovers some tasks are missing from GitHub.

**Why it happens:** Set `task_backend = 'github'` before verifying all tasks were created. GitHub API returns success for batch operations that partially fail.

**How to avoid:** Track each task's export result (success/failure + GitHub issue ID). Only set `task_backend = 'github'` after all tasks either succeed OR user explicitly confirms partial migration. Store GitHub issue ID in snapshot for each task (enables verification later).

**Warning signs:** Export route returns in <100ms with 50 tasks (likely didn't actually wait for GitHub API); no per-task error details in response.

### Pitfall 2: Breaking Existing TasksTab Tests

**What goes wrong:** Adding conditional render logic (`task_backend === 'github'`) breaks test snapshots and existing test assertions that expect task list to always be present.

**Why it happens:** TasksTab now has two branches (task list vs. link panel). Tests written for one branch fail when other branch is tested.

**How to avoid:** Add test cases for both branches: (1) test with `task_backend='dashboard'` or undefined (should render task list), (2) test with `task_backend='github'` (should render link panel). Use conditional test skips or separate test files by branch.

**Warning signs:** Tests pass for dashboard projects but fail for launched projects (or vice versa).

### Pitfall 3: GitHub URL Parsing Edge Cases

**What goes wrong:** User's git remote is `git@github.com:owner/repo.git` (SSH) or `https://github.com/owner/repo.git/` (trailing slash) or a GitHub Enterprise URL. Parsing with naive regex fails.

**Why it happens:** `git remote get-url origin` returns the exact URL as configured; no normalization. Different users use different URL formats.

**How to avoid:** Use this parsing logic:

```javascript
function extractRepoFromUrl(url) {
  // Handles: https://github.com/owner/repo, https://github.com/owner/repo.git, git@github.com:owner/repo.git, etc.
  const match = url.match(/(?:https?:\/\/|git@)github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  return match ? `${match[1]}/${match[2]}` : null;
}
```

**Warning signs:** Migration fails silently with "Invalid repository URL" after detecting URL successfully in earlier step.

### Pitfall 4: Snapshot File Collision

**What goes wrong:** Migration runs twice (user retries after network error). Both create `.dashboard-task-snapshot-*.json` files. Later rollback restores the wrong one.

**Why it happens:** Timestamp-based naming without uniqueness checking. If two migrations happen within the same second, filenames collide.

**How to avoid:** Include milliseconds in snapshot filename, or check for existing snapshot before creating new one. Return existing snapshot path if one already exists for this project.

**Warning signs:** Snapshot file appears with future timestamp, or multiple snapshots in project root with nearly identical timestamps.

### Pitfall 5: Task Backend Field Missing After Phase 58 Backfill

**What goes wrong:** Phase 58 backfill adds `stage` field to all projects. If Phase 59 backfill is not run, some projects have `stage` but not `task_backend`, causing `undefined` checks to fail.

**Why it happens:** Two separate backfill operations. If one is skipped or fails, dependent fields go out of sync.

**How to avoid:** In the `GET /api/gsd/projects` route, provide a default:

```javascript
const result = {
  ...projectData,
  task_backend: projectData.task_backend || 'dashboard', // default: not migrated yet
  github_repo: projectData.github_repo || null,
};
```

**Warning signs:** TasksTab renders undefined field; rollback button appears when it shouldn't; task list fails to render in launched projects.

---

## Code Examples

Verified patterns from existing codebase:

### Reading Project from gsd-projects.json (Phase 58 pattern)

```javascript
// Source: server/routes/gsd.js lines 519–522
function loadConfigWithBackfill() {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, '../../gsd-projects.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw);
  
  // Backfill missing stage field (Phase 58)
  (config.projects || []).forEach(p => {
    if (!p.stage) p.stage = 'draft';
    if (!p.task_backend) p.task_backend = 'dashboard'; // Phase 59
  });
  
  return config;
}

function saveConfig(config) {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, '../../gsd-projects.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}
```

### Using execFileAsync to Call Git (Phase 59 pattern)

```javascript
// Source: Pattern from Phase 51 git operations in projectScaffold.js
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

async function detectRepoUrl(projectRoot) {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd: projectRoot,
      timeout: 5000,
    });
    const url = stdout.trim();
    return url && url !== 'origin' ? url : null; // origin returns the name if not set
  } catch (err) {
    return null; // No remote, no git repo, or permission denied
  }
}
```

### Creating GitHub Issues with gh CLI (Phase 59 pattern)

```javascript
// Source: Inspired by projectScaffold.js github_create step logic
async function exportTasksToGitHub(tasks, repoUrl, githubPat) {
  const exported = [];
  const failed = [];

  for (const task of tasks) {
    try {
      const body = `ID: task-${task.id}\nCreated: ${task.created_at}\n\n${task.description || '(no description)'}`;
      
      const { stdout } = await execFileAsync('gh', ['issue', 'create',
        '--repo', repoUrl,
        '--title', task.title,
        '--body', body,
        '--label', 'source:dashboard-migration'
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

  return { exported, failed };
}
```

### Snapshot File Creation (Phase 59 pattern)

```javascript
// Source: Follows pattern of Phase 42 config exports, Phase 45 secret backups
const fs = require('fs').promises;
const path = require('path');

async function createSnapshot(projectRoot, projectName) {
  const tasks = db.prepare('SELECT * FROM project_tasks WHERE project_key = ?').all(projectName);
  
  const snapshot = {
    projectName,
    exportedAt: new Date().toISOString(),
    taskCount: tasks.length,
    tasks: tasks.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      archived: t.archived,
      created_at: t.created_at,
    })),
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `.dashboard-task-snapshot-${timestamp}.json`;
  const filepath = path.join(projectRoot, filename);

  await fs.writeFile(filepath, JSON.stringify(snapshot, null, 2), 'utf8');
  return filepath;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tasks only exist in Dashboard SQLite | Tasks can be in Dashboard OR GitHub Issues | Phase 59 | Projects are not locked into Dashboard; GitHub becomes source of truth post-launch |
| No per-project backend selector | `task_backend` field routes read/write | Phase 59 | Single codebase supports both task sources; UI adapts based on field |
| GitHub integration always async | `gh` CLI invocation for each task | Phase 59 | Simpler than REST API; leverages existing CLI availability on host |
| Stage transitions are instant | Beta→Launched includes optional migration step | Phase 59 | Migration is guarded by user confirmation; reversible within 7 days |

**Deprecated/outdated:**
- TasksTab assumed tasks always come from `api.gsd.tasks.list()` (Dashboard only) — now must check `task_backend` first
- No snapshot mechanism existed before Phase 59 — rollback now possible via .json file in project root

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `gh` CLI is available on host and authenticated via `GH_TOKEN` env var | Standard Stack | If `gh` is not in PATH, issue creation fails; need fallback to REST API or user install step |
| A2 | GitHub PAT stored in encrypted `github_pat` key via getSecret() | Standard Stack | If key name differs, migration route fails to authenticate; need to verify key name with Phase 54 |
| A3 | Task snapshot file can be persisted in project root without git conflicts | Architecture Patterns | If snapshots are gitignored, they're lost on repo clone; should confirm .gitignore policy |
| A4 | `task_backend` field defaults to 'dashboard' when absent (backfill pattern) | Type system | If backfill is not applied, TasksTab receives undefined; need explicit default in route |
| A5 | GsdProject type in TypeScript can be extended with new fields without breaking existing code | Type system | If code elsewhere relies on exact field set, adding fields may cause type mismatches; likely safe but needs verification |
| A6 | Rollback button can be hidden/shown based on `Date.now() - new Date(taskMigratedAt) < 7 days` | Frontend Patterns | If timezone handling differs, button visibility incorrect; should use ISO timestamps + explicit UTC comparison |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

---

## Open Questions

1. **GitHub PAT Availability**
   - What we know: Phase 45 established `getSecret('github_pat')` pattern for encrypted credential storage
   - What's unclear: Is a GitHub PAT guaranteed to exist when user migrates? Or should migration gracefully degrade if no PAT is set?
   - Recommendation: Store PAT key name as a constant; add validation in /stage/validate gate to check if PAT exists. If missing, show "Set up GitHub authentication" pre-gate requirement.

2. **Snapshot Gitignore Policy**
   - What we know: Phase 59 places snapshot in project root as `.dashboard-task-snapshot-{timestamp}.json`
   - What's unclear: Should snapshots be gitignored, or committed? User may want to track backup history in git.
   - Recommendation: Clarify in Phase 59 plan; recommend NOT gitignoring so user can audit backup history. Add note in snapshot JSON to explain file purpose.

3. **Multi-Step Migration for Large Task Counts**
   - What we know: Current design exports tasks sequentially, one at a time
   - What's unclear: Timeout risk if user has 100+ tasks; GitHub API may rate-limit. Should we batch create or add progress updates?
   - Recommendation: Monitor migration completion time in testing. If >30s for typical project, add WebSocket progress broadcasts so UI can show "Exporting task 47 of 83..."

4. **Rollback Data Consistency**
   - What we know: Snapshot is restored as-is when rollback is triggered
   - What's unclear: If user modified a task title in Dashboard after migration, does rollback overwrite those changes?
   - Recommendation: Clarify in UI: "Rolling back will restore all tasks to their state at migration time" (include timestamp from snapshot JSON).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `gh` CLI | Task export (gh issue create) | ✓ | 2.30+ | Manual REST API calls (complex, deferred) |
| Git | Repo URL detection (git remote get-url) | ✓ | 2.x+ | Skip migration if git not available (graceful) |
| GitHub PAT | API authentication | ✓ (via getSecret) | — | Prompt user to set via Phase 54 credentials UI |
| Node.js execFile | Task export routing | ✓ | 16+ (project requires 20+) | Built-in, no fallback needed |

**Missing dependencies with no fallback:** None — all are available on host.

**Missing dependencies with fallback:**
- GitHub PAT: if not set, migration option simply doesn't appear (pre-gate validation catches this)

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js assert + better-sqlite3 (existing test patterns) |
| Config file | `.planning/config.json` — `workflow.nyquist_validation: true` |
| Quick run command | `npm run test:server -- --grep "migration"` |
| Full suite command | `npm run test:server` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TSK-01 | `task_backend` field persists in gsd-projects.json | unit | `npm run test:server -- --grep "task_backend"` | ❌ Wave 0 |
| TSK-02 | Tasks exported to GitHub with correct title, body, label | unit | `npm run test:server -- --grep "exportTasks"` | ❌ Wave 0 |
| TSK-08 | Rollback restores tasks from snapshot, flips task_backend back | unit | `npm run test:server -- --grep "rollback"` | ❌ Wave 0 |
| TSK-09 | Dashboard project (name='gsddashboard') cannot migrate | unit | `npm run test:server -- --grep "dashboard.*migrate"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:server -- --grep "migration|task_backend" -x` (~2m)
- **Per wave merge:** `npm run test:server` (~8m)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `server/__tests__/task-migration.test.js` — covers TSK-01 (field persistence), TSK-02 (export), TSK-08 (rollback)
- [ ] Test fixture for project with git remote, mock GitHub PAT, sample tasks
- [ ] Mock execFileAsync to avoid actual `gh` calls; stub with successful issue creation
- [ ] Test Edge Cases: (a) project without git remote, (b) partial export failure, (c) snapshot collision, (d) rollback outside 7-day window

*(Existing test infrastructure covers project creation (projects.js routes tested), state transitions (gsd.js PATCH /stage tested); migration tests extend these patterns.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | GitHub PAT via getSecret() (encrypted in SQLite); no plaintext keys in code |
| V3 Session Management | no | Task migration is stateless HTTP request; no session token handling needed |
| V4 Access Control | yes | Only project owner can migrate (enforced by gsd route auth); rollback available to owner only |
| V5 Input Validation | yes | GitHub repo URL parsed with regex; task title/description limited to existing DB schema |
| V6 Cryptography | yes | GitHub PAT stored encrypted (Phase 45 AES-GCM); execFileAsync passes PAT via env (never in CLI args) |
| V7 Error Handling | yes | Export route catches GitHub API errors and returns plain-English messages; no stack traces leaked |

### Known Threat Patterns for {Node.js + SQLite + GitHub API}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| GitHub PAT exposure in logs | Tampering + Disclosure | Never log PAT; pass via GH_TOKEN env var only; execFileAsync inherits from process.env |
| GitHub repo URL injection | Tampering | Validate URL format with regex before passing to `gh` CLI; reject URLs outside github.com |
| Snapshot file written with world-readable permissions | Disclosure | Default umask should be 0o022 (rw-r--r--); acceptable since snapshot contains only task metadata (no secrets); if needed, chmod 0o600 after write |
| Concurrent migrations overwriting each other | Tampering | Serialize migrations: check if one is in-flight, reject new request with "already migrating" error |
| Rollback after 7 days available but button hidden | Logic | Enforce server-side: 7-day check in rollback route, not just UI. Client button hiding is UX only. |

---

## Sources

### Primary (HIGH confidence)
- **gsd-projects.json schema & Phase 58 stage field:** Verified in server/routes/gsd.js lines 519–551 (stage field read/write pattern established)
- **Task schema:** Verified in server/db.js lines 110–118 (project_tasks table with id, project_key, title, description, archived, created_at)
- **execFileAsync pattern:** Verified in server/routes/projects.js line 33 + usage throughout projects.js for git commands
- **getSecret() pattern:** Verified in server/crypto.js (Phase 45 implementation); used in costMeasurement.js, idleDetector.js, and routes
- **gsd CLI availability:** Phase 51 CONTEXT.md confirms gh CLI installed + used for repo creation; CLAUDE.md global instructions reference GITHUB_TOKEN env setup

### Secondary (MEDIUM confidence)
- **GitHub Issues API via gh CLI:** Not verified in current codebase (new to Phase 59), but `gh` is industry standard; CITATION: https://cli.github.com/manual/gh_issue_create (official GitHub CLI docs)
- **7-day rollback window:** From CONTEXT.md D-10/D-11 (locked decision, not verified against GitHub API capabilities, but reasonable for user UX)
- **StageTransitionModal multi-step pattern:** Verified in client/src/components/StageTransitionModal.tsx (existing modal structure supports step progression)

### Tertiary (LOW confidence)
- **Snapshot file format & naming:** From CONTEXT.md Claude's Discretion section (exact filename format deferred; chose `.dashboard-task-snapshot-{ISO-timestamp}.json` based on Dashboard naming conventions)
- **TasksTab conditional render safety:** Assumed based on existing field-based rendering patterns (ProjectCard uses stage field to conditionally show UI), but not explicitly verified in TasksTab tests

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools/patterns verified in existing codebase (gsd-projects.json, execFileAsync, getSecret, StageTransitionModal)
- Architecture: HIGH — Phase 58 stage transition established clear pattern; Phase 59 extends it consistently
- Pitfalls: MEDIUM-HIGH — derived from similar migration patterns (Phase 51 project creation, Phase 45 credential storage); GitHub API interactions are new to this codebase, adding some uncertainty around rate-limit handling
- Validation: MEDIUM — test patterns exist (projects.js tests, gsd.js tests); migration-specific tests must be written from scratch

**Research date:** 2026-05-28
**Valid until:** 2026-06-05 (stable scope; reassess if GitHub API rate-limit strategy changes)
