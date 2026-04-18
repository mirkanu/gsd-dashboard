---
phase: quick-45
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - /data/home/GameMCP/.claude/get-shit-done  # symlink
  - /data/home/GameMCP/CLAUDE.md
  - /data/home/gsddashboard/gsd-projects.json
autonomous: false
requirements: []
must_haves:
  truths:
    - "/data/home/GameMCP/ directory exists with GSD symlink and CLAUDE.md"
    - "GameMCP appears in the dashboard project list"
    - "A tmux session named 'gamemcp' is running"
  artifacts:
    - path: "/data/home/GameMCP/CLAUDE.md"
      provides: "Project identity and conventions scaffold"
    - path: "/data/home/GameMCP/.claude/get-shit-done"
      provides: "GSD symlink enabling /gsd:* commands"
    - path: "/data/home/gsddashboard/gsd-projects.json"
      provides: "Dashboard project registry"
  key_links:
    - from: "gsd-projects.json"
      to: "dashboard project list"
      via: "server reads gsd-projects.json on startup / hot-reload"
---

<objective>
Bootstrap the GameMCP project: create the directory scaffold, register it in the dashboard, and start a named tmux session.

Purpose: New project needs the standard local-first setup (GSD-enabled directory + dashboard visibility + live tmux session).
Output: /data/home/GameMCP/ with CLAUDE.md + GSD symlink, entry in gsd-projects.json, tmux session "gamemcp" running.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@gsd-projects.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create /data/home/GameMCP/ with GSD symlink and CLAUDE.md scaffold</name>
  <files>/data/home/GameMCP/CLAUDE.md, /data/home/GameMCP/.claude/get-shit-done (symlink)</files>
  <action>
    Run the following commands in order:

    1. Create the project directory and .claude subdirectory:
       mkdir -p /data/home/GameMCP/.claude

    2. Create the GSD symlink (matching the pattern used by all other projects under /data/home/):
       ln -s /data/home/.claude/get-shit-done /data/home/GameMCP/.claude/get-shit-done

    3. Write /data/home/GameMCP/CLAUDE.md with a minimal scaffold:

    ```
    # GameMCP — Claude Code Working Guide

    ## Project mission
    - [Describe GameMCP's purpose here]

    ## Repo map
    - [Fill in as the project grows]

    ## Commands you should know
    - [Add setup, dev, build commands here]

    ## Non-negotiable engineering rules
    - Preserve existing behavior unless explicitly asked to change it.
    - Prefer minimal, reversible diffs.
    ```

    Use the Write tool (not echo/heredoc) to create CLAUDE.md.
  </action>
  <verify>
    <automated>ls -la /data/home/GameMCP/.claude/get-shit-done && test -f /data/home/GameMCP/CLAUDE.md && echo "OK"</automated>
  </verify>
  <done>/data/home/GameMCP/.claude/get-shit-done is a symlink pointing to /data/home/.claude/get-shit-done, and CLAUDE.md exists with scaffold content.</done>
</task>

<task type="auto">
  <name>Task 2: Register GameMCP in gsd-projects.json and start tmux session</name>
  <files>/data/home/gsddashboard/gsd-projects.json</files>
  <action>
    1. Read /data/home/gsddashboard/gsd-projects.json (current content shown in context above).

    2. Append a new entry to the "projects" array before the closing bracket:

    ```json
    {
      "name": "GameMCP",
      "root": "/data/home/GameMCP",
      "tmux_session": "gamemcp",
      "services": [
        { "name": "GitHub", "statusUrl": "https://www.githubstatus.com/api/v2/status.json" },
        { "name": "Claude", "statusUrl": "https://status.anthropic.com/api/v2/status.json" }
      ]
    }
    ```

    Use the Write tool to update the full file with the new entry added.

    3. Start the tmux session (detached, named "gamemcp", starting in the project directory):
       tmux new-session -d -s gamemcp -c /data/home/GameMCP

    If a session named "gamemcp" already exists this command will error — that is fine, it means the session is already running. Check with:
       tmux has-session -t gamemcp 2>/dev/null && echo "already running" || tmux new-session -d -s gamemcp -c /data/home/GameMCP
  </action>
  <verify>
    <automated>node -e "const p=require('./gsd-projects.json');const g=p.projects.find(x=>x.name==='GameMCP');console.log(g?'FOUND':'MISSING',JSON.stringify(g))" && tmux has-session -t gamemcp 2>/dev/null && echo "tmux: OK"</automated>
  </verify>
  <done>gsd-projects.json contains a GameMCP entry with root=/data/home/GameMCP and tmux_session=gamemcp. tmux session "gamemcp" is running.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    - /data/home/GameMCP/ created with GSD symlink and CLAUDE.md scaffold
    - GameMCP registered in gsd-projects.json
    - tmux session "gamemcp" started
  </what-built>
  <how-to-verify>
    1. Check the dashboard at https://gsd-dashboard-production.up.railway.app — GameMCP should appear in the project list (note: Railway proxy mode reads gsd-projects.json from the local PM2 process, so the dashboard will show it after a PM2 restart if needed).
    2. Locally verify: tmux list-sessions | grep gamemcp
    3. Confirm directory: ls -la /data/home/GameMCP/.claude/get-shit-done
  </how-to-verify>
  <resume-signal>Type "approved" if everything looks good, or describe any issues</resume-signal>
</task>

</tasks>

<verification>
- /data/home/GameMCP/.claude/get-shit-done symlinks to /data/home/.claude/get-shit-done
- /data/home/GameMCP/CLAUDE.md exists with scaffold content
- gsd-projects.json "projects" array includes an entry with name="GameMCP", root="/data/home/GameMCP", tmux_session="gamemcp"
- tmux session "gamemcp" is listed in `tmux list-sessions`
</verification>

<success_criteria>
- `ls -la /data/home/GameMCP/.claude/get-shit-done` shows the symlink target
- `node -e "require('./gsd-projects.json').projects.find(x=>x.name==='GameMCP')"` prints the entry (not undefined)
- `tmux has-session -t gamemcp` exits 0
</success_criteria>

<output>
After completion, create `.planning/quick/45-create-a-new-project-gamemcp-new-subfold/45-SUMMARY.md`
</output>
