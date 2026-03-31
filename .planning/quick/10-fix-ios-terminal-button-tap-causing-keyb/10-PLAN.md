---
phase: quick-10
plan: 10
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/pages/GSD.tsx
autonomous: true
requirements: [quick-10]

must_haves:
  truths:
    - "Tapping a SpecialKeyBar button on iOS does not cause the keyboard to flicker (hide then show)"
    - "Tapping a SpecialKeyBar button sends the correct key sequence to the terminal"
    - "Terminal remains focused after tapping a SpecialKeyBar button"
  artifacts:
    - path: "client/src/pages/GSD.tsx"
      provides: "specialKeyPressRef guard in handleXtermBlur"
  key_links:
    - from: "SpecialKeyBar onTouchStart"
      to: "specialKeyPressRef.current = true"
      via: "ref set before send()"
    - from: "handleXtermBlur"
      to: "specialKeyPressRef.current check"
      via: "skip setTerminalFocused(false) + immediately refocus"
---

<objective>
Fix the iOS keyboard flicker when tapping SpecialKeyBar buttons in the mobile terminal.

Purpose: On iOS, tapping a button outside the xterm textarea triggers a native blur on the hidden textarea, firing handleXtermBlur which sets terminalFocused=false, causing SendBox to appear and the keyboard to hide. Then terminal.focus() in send() refocuses it, reversing the change. The visible result is a keyboard toggle flicker and layout shift on every special key tap.

Output: A `specialKeyPressRef` boolean ref that SpecialKeyBar sets to `true` on touchstart and `false` on touchend. The `handleXtermBlur` handler checks this ref — if set, it immediately refocuses the terminal and skips the `setTerminalFocused(false)` call, preventing any flicker.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@client/src/pages/GSD.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add specialKeyPressRef guard to suppress iOS blur flicker</name>
  <files>client/src/pages/GSD.tsx</files>
  <action>
In `TerminalOverlay` (around line 196):

1. Add a new ref below the existing refs (termRef, wsRef, etc.):
   ```ts
   const specialKeyPressRef = useRef(false);
   ```

2. Pass `specialKeyPressRef` as a prop to `SpecialKeyBar` (line ~500):
   ```tsx
   <SpecialKeyBar wsRef={wsRef} termRef={termRef} specialKeyPressRef={specialKeyPressRef} />
   ```

3. Update the `SpecialKeyBar` function signature to accept the new prop:
   ```ts
   function SpecialKeyBar({
     wsRef,
     termRef,
     specialKeyPressRef,
   }: {
     wsRef: React.RefObject<WebSocket | null>;
     termRef: React.RefObject<Terminal | null>;
     specialKeyPressRef: React.RefObject<boolean>;
   })
   ```

4. In `SpecialKeyBar`, update each button's touch handlers (lines ~173-176):
   - `onTouchStart`: set `specialKeyPressRef.current = true` BEFORE calling `send()`:
     ```ts
     onTouchStart={(e) => { e.preventDefault(); specialKeyPressRef.current = true; send(key.seq); }}
     ```
   - `onTouchEnd`: set `specialKeyPressRef.current = false` and keep `e.preventDefault()`:
     ```ts
     onTouchEnd={(e) => { e.preventDefault(); specialKeyPressRef.current = false; }}
     ```

5. Update `handleXtermBlur` (lines ~362) in the useEffect to check the ref:
   ```ts
   const handleXtermBlur = () => {
     if (specialKeyPressRef.current) {
       // Special key tap caused this blur — immediately refocus to prevent keyboard flicker
       terminal.focus();
       return;
     }
     setTerminalFocused(false);
   };
   ```

No other changes. The `handleXtermFocus` path is unchanged — after refocusing the terminal via `terminal.focus()` in both the ref guard and the existing `send()`, the focus event fires and `setTerminalFocused(true)` keeps SendBox hidden as expected.
  </action>
  <verify>
    <automated>npm run test:client 2>&1 | tail -20</automated>
  </verify>
  <done>
    - `specialKeyPressRef` declared in `TerminalOverlay` and passed to `SpecialKeyBar`
    - `SpecialKeyBar` sets ref to `true` on touchstart and `false` on touchend
    - `handleXtermBlur` returns early (with immediate `terminal.focus()`) when ref is true
    - Client test suite passes
  </done>
</task>

</tasks>

<verification>
After implementing:
- Run `npm run test:client` — must pass
- On iOS (or iOS Simulator), open the terminal overlay for a project, tap Esc / Left / Enter buttons — keyboard must stay visible with no flicker or SendBox appearing between taps
</verification>

<success_criteria>
Tapping any SpecialKeyBar button on iOS sends the key sequence to the terminal without causing the keyboard to hide and re-show. No layout shift or SendBox flash occurs during special key taps.
</success_criteria>

<output>
After completion, create `.planning/quick/10-fix-ios-terminal-button-tap-causing-keyb/10-SUMMARY.md`
</output>
