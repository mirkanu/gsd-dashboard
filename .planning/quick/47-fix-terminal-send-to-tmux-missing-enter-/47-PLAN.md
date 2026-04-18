---
phase: quick-47
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server/routes/gsd.js
  - client/src/pages/GSD.tsx
autonomous: true
requirements: [QUICK-47]
must_haves:
  truths:
    - "Text sent to tmux is treated as literal text, never misinterpreted as tmux key names"
    - "Enter is reliably sent after text in the tmux send endpoint"
    - "Pressing shortcut buttons when terminal is not focused does NOT open the iOS keyboard"
    - "Pressing shortcut buttons when terminal IS focused keeps the keyboard open"
  artifacts:
    - path: "server/routes/gsd.js"
      provides: "Fixed send-keys calls using -l flag for literal text"
    - path: "client/src/pages/GSD.tsx"
      provides: "Fixed onTouchStart handler with wasFocused guard"
  key_links:
    - from: "client/src/pages/GSD.tsx SpecialKeyBar"
      to: "xterm-helper-textarea focus state"
      via: "document.activeElement.classList check before termRef.current?.focus()"
      pattern: "wasFocused.*classList.*xterm-helper-textarea"
---

<objective>
Fix two terminal bugs: (1) tmux send-keys missing the -l flag causes text matching tmux key names to be misinterpreted; (2) shortcut buttons (arrow keys, Enter, etc.) unconditionally call focus() which opens the iOS keyboard even when the terminal was not previously focused.

Purpose: Both bugs directly degrade terminal usability on mobile — text input is unreliable and the keyboard appears unexpectedly.
Output: Patched server/routes/gsd.js and client/src/pages/GSD.tsx.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix tmux send-keys to use -l flag for literal text</name>
  <files>server/routes/gsd.js</files>
  <action>
In the POST /api/gsd/projects/:name/send route (around lines 286-302), fix both send-keys calls:

1. Large-text path (currently line ~299): change
   `['send-keys', '-t', tmux_session, '', 'Enter']`
   to
   `['send-keys', '-t', tmux_session, 'Enter']`
   (remove the empty string argument — it serves no purpose and may confuse tmux)

2. Normal-text path (currently line ~301): replace the single call
   `execFileSync('tmux', ['send-keys', '-t', tmux_session, text, 'Enter'], { stdio: 'ignore' });`
   with two sequential calls:
   ```js
   execFileSync('tmux', ['send-keys', '-t', tmux_session, '-l', text], { stdio: 'ignore' });
   execFileSync('tmux', ['send-keys', '-t', tmux_session, 'Enter'], { stdio: 'ignore' });
   ```
   The -l flag sends text literally so tmux never interprets it as a key name (e.g. "Space", "Escape", "Up").
  </action>
  <verify>
    <automated>npm run test:server</automated>
  </verify>
  <done>send-keys calls use -l for text and a separate call for Enter; server tests pass</done>
</task>

<task type="auto">
  <name>Task 2: Guard terminal focus() in shortcut bar to prevent unwanted iOS keyboard</name>
  <files>client/src/pages/GSD.tsx</files>
  <action>
In the SpecialKeyBar component's onTouchStart handler (around lines 201-213), add a wasFocused check before calling termRef.current?.focus().

Replace the current handler body with:
```js
const onTouchStart = (e: TouchEvent) => {
  const btn = (e.target as HTMLElement).closest('button');
  if (!btn) return;
  e.preventDefault();
  const wasFocused = document.activeElement?.classList.contains('xterm-helper-textarea');
  specialKeyPressRef.current = true;
  const idx = parseInt(btn.getAttribute('data-idx') ?? '', 10);
  const key = SPECIAL_KEYS[idx];
  if (key) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(key.seq);
    }
    if (wasFocused) {
      termRef.current?.focus();
    }
  }
};
```

The xterm terminal's input textarea always has class `xterm-helper-textarea`. Checking document.activeElement against it determines whether the user was already typing (keyboard visible). Only in that case do we re-focus — keeping the keyboard open. When the terminal was not focused, we send the key but do not trigger focus(), so the iOS keyboard stays hidden.
  </action>
  <verify>
    <automated>npm run test:client</automated>
  </verify>
  <done>onTouchStart checks wasFocused before calling focus(); client tests pass</done>
</task>

</tasks>

<verification>
- npm run test:server passes (no regressions in send route)
- npm run test:client passes (no regressions in GSD page)
- server/routes/gsd.js send-keys calls use -l flag for text and a separate Enter call
- client/src/pages/GSD.tsx onTouchStart only calls termRef.current?.focus() when xterm-helper-textarea was already the active element
</verification>

<success_criteria>
- Text containing tmux key names (e.g. "Enter", "Space", "Escape") is sent literally to the tmux session without being intercepted as keys
- Enter is appended after all sent text
- Tapping arrow/Enter shortcut buttons while terminal is not focused sends the key without opening the iOS keyboard
- Tapping shortcut buttons while typing (terminal focused) keeps the keyboard open
</success_criteria>

<output>
After completion, create `.planning/quick/47-fix-terminal-send-to-tmux-missing-enter-/47-SUMMARY.md`
</output>
