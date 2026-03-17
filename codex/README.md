# Codex Agent Setup

This directory contains project-scoped Codex extensions:

- instruction baseline via root [`AGENTS.md`](../AGENTS.md)
- execution policy rules in [`codex/rules/default.rules`](./rules/default.rules)
- custom subagent definitions in [`codex/agents/`](./agents)
- reusable skills in [`codex/skills/`](./skills)

## What Codex reads by default

- `AGENTS.md` from repository tree
- `.codex/agents/*.toml` for custom agents
- `.agents/skills/*/SKILL.md` for project skills
- `codex/rules/*.rules` (per Codex rules docs)

## Activate project agents and skills

Depending on your Codex runtime setup, copy or symlink these files:

1. Custom agents:
   - source: `codex/agents/*.toml`
   - target: `.codex/agents/`
2. Skills:
   - source: `codex/skills/*`
   - target: `.agents/skills/`
3. Rules:
   - source: `codex/rules/default.rules`
   - target: `codex/rules/default.rules` (already in place)

Automatic sync from repo root:

```bash
npm run codex:sync
```

If sync fails due restricted hidden directories in your environment, use the manual copy commands below.

Optional destination overrides:

- `CODEX_PROJECT_AGENTS_DIR`
- `CODEX_PROJECT_SKILLS_DIR`

## Suggested activation commands

PowerShell:

```powershell
New-Item -ItemType Directory -Force -Path .codex\agents, .agents\skills | Out-Null
Copy-Item -Recurse -Force codex\agents\*.toml .codex\agents\
Copy-Item -Recurse -Force codex\skills\* .agents\skills\
```

Bash:

```bash
mkdir -p .codex/agents .agents/skills
cp -f codex/agents/*.toml .codex/agents/
cp -R codex/skills/* .agents/skills/
```

Restart Codex after activation.

## Included custom agents

- `reviewer`: read-only, high-rigor review agent
- `implementer`: workspace-write implementation agent
- `release_auditor`: read-only release readiness checker

## Included skills

- `repo-onboarding`
- `mcp-maintainer`
- `release-guard`
