---
phase: quick-11
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/pages/GSD.tsx
  - server/routes/gsd.js
autonomous: true
requirements: [quick-11]

must_haves:
  truths:
    - "User can tap Paste in the terminal header and clipboard text is sent directly to the pty"
    - "Large text (>1000 chars) sent via SendBox reaches the tmux session without error"
    - "Paste button shows brief 'Pasted!' feedback then reverts to 'Paste'"
  artifacts:
    - path: "client/src/pages/GSD.tsx"
      provides: "Paste button in TerminalOverlay header bar (mobile only)"
    - path: "server/routes/gsd.js"
      provides: "Fixed send endpoint using tmux load-buffer + paste-buffer for large text"
  key_links:
    - from: "Paste button (GSD.tsx)"
      to: "wsRef.current.send(text)"
      via: "navigator.clipboard.readText() then send directly to pty WebSocket"
    - from: "POST /api/gsd/projects/:name/send"
      to: "tmux paste-buffer"
      via: "spawnSync tmux load-buffer from stdin + tmux paste-buffer for text > 1000 chars"
---

<objective>
Fix large-paste failures in the terminal and add a mobile Paste button that bypasses the HTTP API entirely.

Purpose: SendBox uses tmux send-keys which hits command-line argument length limits on large text. The Paste button sends directly to the pty via WebSocket. The server-side fix catches any large text submitted through SendBox.

Output: Paste button in terminal header (mobile only), server send endpoint robust for large inputs.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<interfaces>
From client/src/pages/GSD.tsx (relevant existing patterns):

```typescript
// wsRef used for pty I/O — already available in TerminalOverlay scope
const wsRef = useRef<WebSocket | null>(null);

// isMobile check used for Select button (same pattern for Paste)
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Select button in header (lines 500-512) — Paste goes in same flex container
{isMobile && (
  <button onClick={toggleSelectMode} ...>
    {selectMode ? 'Done' : 'Select'}
  </button>
)}

// wsRef.current.send() used in SpecialKeyBar (line 188) — same pattern for Paste
wsRef.current.send(key.seq);
```

From server/routes/gsd.js (lines 206-213):

```javascript
// Current implementation — fails on large text via arg length limits
execFileSync('tmux', ['send-keys', '-t', tmux_session, text, 'Enter'], { stdio: 'ignore' });

// Fix: use spawnSync with stdin for large text
// tmux load-buffer - reads from stdin, then tmux paste-buffer -t session pastes it
const { spawnSync } = require('child_process');
const load = spawnSync('tmux', ['load-buffer', '-'], { input: text, encoding: 'utf8' });
spawnSync('tmux', ['paste-buffer', '-t', tmux_session]);
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Add Paste button to TerminalOverlay header (mobile only)</name>
  <files>client/src/pages/GSD.tsx</files>
  <action>
In TerminalOverlay, add a Paste button to the header bar immediately before the existing Select button (inside the `{isMobile && (...)}` block or as its own sibling `{isMobile && (...)}` block — place it between the project name span and the Select button so the order is: [Paste] [Select] [X]).

Steps:
1. Import `ClipboardPaste` from `lucide-react` at the top of the file (check what is already imported — add `ClipboardPaste` to the existing lucide import line).
2. Add state in TerminalOverlay: `const [pasteLabel, setPasteLabel] = useState<'Paste' | 'Pasted!'>('Paste');`
3. Add handler in TerminalOverlay:
```typescript
const handlePaste = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(text);
      setPasteLabel('Pasted!');
      setTimeout(() => setPasteLabel('Paste'), 1500);
    }
  } catch {
    // Clipboard read denied — silently ignore
  }
};
```
4. Add the button in the header flex container, before the Select button:
```tsx
{isMobile && (
  <button
    onClick={handlePaste}
    className="text-xs px-2 py-1 rounded border transition-colors select-none bg-surface-3 text-gray-400 border-border hover:text-white"
    aria-label="Paste clipboard into terminal"
  >
    {pasteLabel}
  </button>
)}
```

Do NOT modify the Select button or X button. Do NOT add the Paste button on desktop.
  </action>
  <verify>
    <automated>npm run test:client 2>&1 | tail -20</automated>
  </verify>
  <done>Paste button visible in terminal header on mobile (isMobile === true), tapping it reads clipboard and calls wsRef.current.send(text), label shows 'Pasted!' for 1.5s. Desktop users see no button.</done>
</task>

<task type="auto">
  <name>Task 2: Fix server send endpoint for large text via tmux load-buffer</name>
  <files>server/routes/gsd.js</files>
  <action>
In the POST `/api/gsd/projects/:name/send` handler (around line 206-213), replace the single `execFileSync` call with logic that uses `tmux load-buffer` + `tmux paste-buffer` for large text, falling back to `send-keys` for short text.

Replace the try block:
```javascript
try {
  const { execFileSync, spawnSync } = require('child_process');
  if (text.length > 1000) {
    // Large text: use tmux load-buffer (reads from stdin) + paste-buffer to avoid arg length limits
    const load = spawnSync('tmux', ['load-buffer', '-'], { input: text, encoding: 'utf8', stdio: ['pipe', 'ignore', 'ignore'] });
    if (load.status !== 0) {
      return res.status(500).json({ error: 'Failed to load buffer in tmux session', detail: load.stderr });
    }
    const paste = spawnSync('tmux', ['paste-buffer', '-t', tmux_session], { stdio: 'ignore' });
    if (paste.status !== 0) {
      return res.status(500).json({ error: 'Failed to paste buffer to tmux session' });
    }
    // Also send Enter after paste
    execFileSync('tmux', ['send-keys', '-t', tmux_session, '', 'Enter'], { stdio: 'ignore' });
  } else {
    execFileSync('tmux', ['send-keys', '-t', tmux_session, text, 'Enter'], { stdio: 'ignore' });
  }
  try { stmts.insertGsdMessage.run(name, 'outbound', text); } catch { /* non-blocking */ }
  return res.json({ ok: true });
} catch (err) {
  return res.status(500).json({ error: 'Failed to send keys to tmux session', detail: err.message });
}
```

Do NOT change the route path, request validation, or response shape for the success case (`{ ok: true }`). Preserve the `insertGsdMessage` call.
  </action>
  <verify>
    <automated>npm run test:server 2>&1 | tail -20</automated>
  </verify>
  <done>Short text (&lt;=1000 chars) still uses send-keys. Text over 1000 chars uses load-buffer + paste-buffer. Server test suite passes. Response shape unchanged: `{ ok: true }` on success.</done>
</task>

</tasks>

<verification>
After both tasks:
- Run `npm run test:client` and `npm run test:server` — both must pass
- Verify `client/src/pages/GSD.tsx` has `ClipboardPaste` or `Clipboard` imported from lucide-react (or the text-only Paste button approach with no icon import if ClipboardPaste is unavailable)
- Verify `server/routes/gsd.js` contains `spawnSync` and `load-buffer` in the send handler
- Build check: `npm run build` exits 0
</verification>

<success_criteria>
- Paste button appears in terminal header on mobile browsers
- Tapping Paste reads clipboard and sends text directly to pty via WebSocket (no HTTP round-trip)
- Button label shows 'Pasted!' for 1.5s after tap
- SendBox with large text (&gt;1000 chars) succeeds via server-side tmux load-buffer path
- All existing tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/11-fix-sendbox-error-on-large-paste-and-add/11-SUMMARY.md` following the summary template.
</output>
