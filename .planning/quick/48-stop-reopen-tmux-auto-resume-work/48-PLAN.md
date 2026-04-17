---
phase: quick-48
created: 2026-04-17
goal: Stop the "Re-open Tmux" button from auto-sending /gsd-resume-work
---

<objective>
The reopen-tmux route currently auto-sends `/gsd-resume-work` ~10s after launching Claude. This is unwanted because sometimes resume isn't needed. Remove the setTimeout block so the user sends the command (or not) themselves.

Output: `server/routes/gsd.js` reopen-tmux handler with the auto-resume setTimeout removed.
</objective>

<tasks>

<task>
  <name>Remove auto-send setTimeout from reopen-tmux route</name>
  <files>server/routes/gsd.js</files>
  <action>
In `POST /api/gsd/projects/:name/reopen-tmux` (around line 339-346), delete the setTimeout block that injects `/gsd-resume-work` after Claude boots. Keep the new-session and `claude --dangerously-skip-permissions` send-keys calls intact.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard &amp;&amp; npm run test:server 2>&amp;1 | tail -20</automated>
  </verify>
</task>

</tasks>

<success_criteria>
After clicking "Re-open Tmux", a fresh tmux session launches Claude but no `/gsd-resume-work` is auto-sent. The user types it manually if they want it.
</success_criteria>
