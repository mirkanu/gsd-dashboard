---
phase: quick-9
plan: 9
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/pages/GSD.tsx
autonomous: true
requirements: [QUICK-9]

must_haves:
  truths:
    - "A 'Select' toggle button appears in the terminal header bar on mobile"
    - "When Select mode is ON, the user can long-press and drag to select text in the terminal"
    - "When text is selected, it is automatically copied to clipboard via the existing onSelectionChange handler"
    - "When Select mode is OFF, normal touch-scroll behavior is restored"
    - "Toggling Select mode OFF clears the selection and refocuses the terminal"
  artifacts:
    - path: "client/src/pages/GSD.tsx"
      provides: "selectMode state + conditional touch handler bypass + Select button in header"
  key_links:
    - from: "selectMode state"
      to: "handleTouchMove / handleTouchEnd"
      via: "ref read inside captured event handlers"
      pattern: "selectModeRef\\.current"
    - from: "terminal.onSelectionChange"
      to: "navigator.clipboard.writeText"
      via: "existing handler at line 283"
      pattern: "onSelectionChange"
---

<objective>
Add a "Select" mode toggle to the mobile terminal overlay so users can long-press and drag to select text (e.g. URLs, commands) and have it automatically copied to clipboard.

Purpose: On mobile, capture-phase touch handlers intercept all touch events before xterm.js can act. A dedicated Select mode bypasses these handlers so xterm.js receives touches and performs its own text selection. The existing onSelectionChange handler (line 283) already auto-copies to clipboard.

Output: A "Select" toggle button in the terminal header bar. When ON, touch handlers yield to xterm.js for text selection. When OFF, normal tmux scroll behavior resumes.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@client/src/pages/GSD.tsx

Key facts about the current implementation:

1. TerminalOverlay renders: header bar | terminal container | (mobile only) SendBox + SpecialKeyBar
2. Touch handlers are registered inside the main useEffect at line ~319:
   - handleTouchStart: records touchStartY/X, resets scrollIntent
   - handleTouchMove: if vertical scroll intent, calls e.preventDefault() + e.stopImmediatePropagation() (this is what blocks xterm.js)
   - handleTouchEnd: if no scrollIntent, calls terminal.focus()
3. All three handlers are added with { capture: true } so they fire before xterm.js
4. terminal.onSelectionChange() at line 283 already copies selected text to clipboard
5. SpecialKeyBar is at line 161; it renders in the flex-shrink-0 mobile block at the bottom
6. The terminal header bar is at line 410: flex row with project name on left and X close button on right

Interface from GSD.tsx (relevant):
```typescript
// State already in TerminalOverlay:
const [isMobile] = useState(() => window.matchMedia('(pointer: coarse)').matches);

// useRef pattern (must use ref inside event handlers — stale closure risk with state):
const selectModeRef = useRef(false);       // add this
const [selectMode, setSelectMode] = useState(false);  // add this (drives re-render for button UI)

// touch handler locations (lines ~323-353):
const handleTouchMove = (e: TouchEvent) => { ... e.preventDefault(); e.stopImmediatePropagation(); ... };
const handleTouchEnd = () => { if (!scrollIntent) terminal.focus(); };
```
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Select mode toggle to TerminalOverlay</name>
  <files>client/src/pages/GSD.tsx</files>
  <action>
Make the following targeted changes to TerminalOverlay in client/src/pages/GSD.tsx:

**1. Add state + ref after the existing state declarations (~line 206):**
```typescript
const [selectMode, setSelectMode] = useState(false);
const selectModeRef = useRef(false);  // ref for use inside event handlers (avoids stale closure)
```

**2. In handleTouchMove, add an early return at the top of the function if select mode is active:**
```typescript
const handleTouchMove = (e: TouchEvent) => {
  if (selectModeRef.current) return;  // ADD THIS LINE — let xterm.js handle in select mode
  const dy = touchStartY - e.touches[0].clientY;
  // ... rest of existing code unchanged
```

**3. In handleTouchEnd, skip the terminal.focus() call when in select mode (so it doesn't clear the selection):**
```typescript
const handleTouchEnd = () => {
  if (selectModeRef.current) return;  // ADD THIS LINE — don't steal focus/clear selection
  if (!scrollIntent) terminal.focus();
};
```

**4. Add a toggleSelectMode handler that keeps state and ref in sync:**
```typescript
const toggleSelectMode = () => {
  const next = !selectMode;
  selectModeRef.current = next;
  setSelectMode(next);
  if (!next) {
    // Exiting select mode: clear selection and restore focus
    termRef.current?.clearSelection();
    termRef.current?.focus();
  }
};
```
Place this function inside TerminalOverlay, after the useEffects.

**5. Add the Select button to the header bar (line ~410), to the LEFT of the existing close button:**
```tsx
{/* Header bar */}
<div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d] flex-shrink-0">
  <span className="text-sm text-gray-300 font-mono">{projectName} — tmux session</span>
  <div className="flex items-center gap-2">
    {isMobile && (
      <button
        onClick={toggleSelectMode}
        className={`text-xs px-2 py-1 rounded border transition-colors select-none ${
          selectMode
            ? 'bg-accent/20 text-accent border-accent/30'
            : 'bg-surface-3 text-gray-400 border-border hover:text-white'
        }`}
        aria-label={selectMode ? 'Exit select mode' : 'Enter select mode to copy text'}
      >
        {selectMode ? 'Done' : 'Select'}
      </button>
    )}
    <button
      onClick={onClose}
      className="p-1 rounded hover:bg-surface-3 text-gray-400 hover:text-white transition-colors"
      aria-label="Close terminal"
    >
      <X className="w-4 h-4" />
    </button>
  </div>
</div>
```

Note: The existing onSelectionChange handler at line ~283 already auto-copies selected text to clipboard — no changes needed there.

No new imports required (useState and useRef are already imported).
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:client 2>&1 | tail -20</automated>
  </verify>
  <done>
    - selectMode state and selectModeRef are declared in TerminalOverlay
    - handleTouchMove returns early when selectModeRef.current is true
    - handleTouchEnd returns early when selectModeRef.current is true
    - toggleSelectMode function syncs both state and ref, clears selection + refocuses on exit
    - Header bar shows a "Select" / "Done" toggle button on mobile only (left of X button)
    - Button is highlighted (accent colors) when active, muted when inactive
    - npm run test:client passes
  </done>
</task>

</tasks>

<verification>
1. Build passes: `npm run build` completes without TypeScript errors
2. Client tests pass: `npm run test:client`
3. Visual check: Open terminal overlay on a mobile device (or DevTools mobile emulation), confirm "Select" button appears in header
4. Function check: Tap "Select", try long-press drag on terminal text — selection should appear and text should be copied to clipboard
5. Scroll check: With Select mode OFF, vertical swipe still scrolls tmux correctly
6. Done check: Tap "Done" — selection clears, terminal regains focus, scroll works again
</verification>

<success_criteria>
- "Select" button visible in terminal header on mobile (hidden on desktop)
- Tapping "Select" enters select mode: button turns accent-highlighted and shows "Done"
- In select mode, touch events pass through to xterm.js enabling text selection
- Selecting text auto-copies it to clipboard via existing onSelectionChange handler
- Tapping "Done" exits select mode: clears selection, restores focus, restores scroll
- Normal tmux touch-scroll works when NOT in select mode
- No regressions in existing desktop behavior
</success_criteria>

<output>
After completion, create `.planning/quick/9-enable-text-selection-and-copy-in-mobile/9-SUMMARY.md` with what was changed and verified.
</output>
