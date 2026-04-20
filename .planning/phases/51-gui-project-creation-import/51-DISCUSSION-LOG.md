# Phase 51: GUI Project Creation + Import - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 51-gui-project-creation-import
**Areas discussed:** Wizard flow & placement, Templates & scaffolding, Import flow depth, Failure modes & partial-state recovery

---

## Wizard Flow & Placement

### Entry point

| Option | Description | Selected |
|--------|-------------|----------|
| Top of projects list | Prominent '+ New Project' button at top of sidebar/projects list | ✓ |
| Top bar / header action | Icon+label button in the top bar | |
| Floating + FAB | Floating circular '+' bottom-right | |

**User's choice:** Top of projects list (Recommended)

### Wizard UI

| Option | Description | Selected |
|--------|-------------|----------|
| Modal dialog | Overlays current view; matches existing dialog patterns | ✓ |
| Full-page route /new-project | Dedicated route, more real estate | |
| Side drawer | Slides in from right, keeps list visible underneath | |

**User's choice:** Modal dialog (Recommended)

### Pacing

| Option | Description | Selected |
|--------|-------------|----------|
| Single form | All fields on one screen | ✓ |
| Stepped wizard (Next/Back) | One decision per screen | |
| Hybrid — progressive disclosure | Start minimal, reveal advanced | |

**User's choice:** Single form (Recommended)

### Submit UX

| Option | Description | Selected |
|--------|-------------|----------|
| Close + skeleton card | Modal closes; skeleton card with progress chip; transitions to 'working' | ✓ |
| Keep modal open with progress | Modal stays open with step-by-step progress | |
| Close + toast | Modal closes; toast tracks progress | |

**User's choice:** Close + skeleton card (Recommended)

---

## Templates & Scaffolding

### Template set

| Option | Description | Selected |
|--------|-------------|----------|
| Blank only | Just subfolder + git + GSD; interview shapes the project | ✓ |
| Blank + 2-3 curated | Blank, Next.js, Node API, Python | |
| Blank + user-suppliable Git URL | Blank default + template-from-URL input | |

**User's choice:** Blank only (Recommended for v5.0)

### Scaffold contents

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal — README + .gitignore + GSD | Clean slate | ✓ |
| Minimal + CLAUDE.md template | Pre-seed global principles | |
| Minimal + CLAUDE.md + empty package.json | Above + package.json | |

**User's choice:** Minimal — README + .gitignore + GSD (Recommended)
**Notes:** CLAUDE.md seeding is Phase 56B's concern — do not encroach from Phase 51.

### Project location

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed root /data/home/{name} | No picker; name sanitized | ✓ |
| Show root, let user edit | Root shown with edit pencil | |
| Path picker | Full folder browser | |

**User's choice:** Fixed root /data/home/{name} (Recommended)

### Tmux boot

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-launch Claude + auto-send /gsd-new-project | End-to-end; one-click start | ✓ |
| Auto-launch Claude, wait for user input | Terminal sits at prompt | |
| Start tmux only, no Claude | User launches Claude when ready | |

**User's choice:** Auto-launch Claude + auto-send /gsd-new-project (Recommended)

---

## Import Flow Depth

### Import input

| Option | Description | Selected |
|--------|-------------|----------|
| Folder name under /data/home/ | Single text input | |
| Full absolute path | User types full path | ✓ (combined) |
| Dropdown of detected candidates | Auto-detect unregistered folders | ✓ (combined) |

**User's choice:** Dropdown of auto-detected candidates + a "Or enter a custom path" input as fallback. Confirmed explicitly in a follow-up question.

### Seeding when no .planning/

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-run analyse-codebase silently | Proceed; run analyse-codebase automatically | ✓ (with confirmation) |
| Prompt user: 'Seed GSD now or skip?' | Explicit choice | |
| Refuse import unless .planning/ exists | Only accept already-GSD folders | |

**User's choice:** Auto-run analyse-codebase, but with a confirmation dialog first ("This folder isn't a GSD project yet — seed now?" Confirm/Cancel).

### Conflict handling

| Option | Description | Selected |
|--------|-------------|----------|
| Block + plain-English error | Inline error; link to existing card | ✓ |
| Auto-rename with suffix | Silent suffix (josie-2) | |
| Prompt user to pick new name inline | Inline suggested alternative | |

**User's choice:** Block + plain-English error (Recommended)

---

## Failure Modes & Partial-State Recovery

### Recovery model

| Option | Description | Selected |
|--------|-------------|----------|
| Keep partial state + 'Resume' button | Record last-succeeded step; Resume reruns from there | ✓ |
| Roll back everything on any failure | Best-effort cleanup | |
| Atomic — no partial state allowed | Transaction-like semantics | |

**User's choice:** Keep partial state + 'Resume' button (Recommended)

### Multi-org PAT selection (NPC-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Default PAT + override dropdown | Pre-fill default; dropdown to override | ✓ |
| Always prompt when >1 PAT | No default; always ask | |
| Infer from project name heuristic | Magic heuristic | |

**User's choice:** Default PAT + override dropdown (Recommended)

### Pre-flight PAT gate

| Option | Description | Selected |
|--------|-------------|----------|
| Gate + link to Services panel | Block wizard if no PAT; route to Services | ✓ |
| Open wizard but show inline warning | Wizard opens; submit blocked | |
| Allow creation without GitHub | Make GitHub optional | |

**User's choice:** Gate + link to Services panel (Recommended)

---

## Claude's Discretion

- Exact copy of button labels, progress chip text, confirmations, inline errors
- Visual design of skeleton creating-card state
- Whether detected-folder scan is cached server-side or recomputed per request
- Resume pipeline implementation (SQLite `creation_state` table recommended)

## Deferred Ideas

- Non-blank templates (Next.js, Node, Python, etc.) → v5.1+
- Path pickers outside /data/home/
- Branch protection on initial push → Phase 58
- Default-branch configurability (assume `main`)
- Auto-services selection beyond GitHub + Claude → Phase 54
- Import of folders with dirty working trees
- Coordination with Phase 58 `stage: draft` field
