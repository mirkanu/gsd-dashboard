---
phase: quick-34
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/pages/GSD.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Terminal mounts immediately on navigation without waiting for a network fetch"
    - "xterm.js is not parsed on page loads where the terminal is not used"
    - "Terminal shows a connecting placeholder instead of blank white while xterm initializes"
  artifacts:
    - path: "client/src/pages/GSD.tsx"
      provides: "All three terminal startup fixes"
  key_links:
    - from: "TerminalPage"
      to: "TerminalOverlay"
      via: "wsBase initialized to null — uses relative URL fallback immediately"
---

<objective>
Fix the 2-3 second terminal load delay caused by three independent issues in GSD.tsx.

Purpose: Terminal should appear and begin connecting the moment the user navigates to it, not after a round-trip network fetch.
Output: Updated GSD.tsx with wsBase fix, connecting placeholder, and dynamic xterm imports.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@client/src/pages/GSD.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix TerminalPage wsBase blocking + add connecting placeholder</name>
  <files>client/src/pages/GSD.tsx</files>
  <action>
    Two targeted edits to GSD.tsx:

    **Fix 1 — Remove wsBase blocking guard in TerminalPage (line ~1184):**
    Change the `useState` initial value from `undefined` to `null`:
    ```
    const [wsBase, setWsBase] = useState<string | null>(null);
    ```
    Remove the `if (wsBase === undefined) return (...)` block entirely (lines ~1191-1197).
    The `TerminalOverlay` already handles `wsBase === null` by falling back to
    `${proto}//${window.location.host}` (line 311), which is the correct relative URL on Railway.
    The wsBase fetch still runs in the background and would update the value if needed, but
    mounting no longer waits for it. Keep the useEffect fetch so wsBase still gets set
    if the server returns a tunnel URL.

    **Fix 2 — Add connecting placeholder inside TerminalOverlay:**
    In the `TerminalOverlay` component, add a `connected` state (initially `false`).
    After `terminal.open(containerRef.current)` and `fitAddon.fit()` (around line 324),
    set `connected = true` via `setConnected(true)`. In the render, inside the terminal
    container div, show a centered "Connecting to terminal..." text in terminal foreground
    color when `!connected`. Use `pointer-events-none` and `absolute inset-0` positioning
    so it overlays the blank xterm canvas before it draws. Remove it once `connected` is true.

    Do NOT change any WebSocket logic, resize handling, mobile key bar, or other behavior.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:client 2>&1 | tail -20</automated>
  </verify>
  <done>
    TerminalPage no longer has a `wsBase === undefined` guard. The component renders
    TerminalOverlay immediately. A "Connecting to terminal..." placeholder appears briefly
    until xterm opens. Client tests pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: Convert xterm static imports to dynamic imports</name>
  <files>client/src/pages/GSD.tsx</files>
  <action>
    Remove the three static top-level imports (lines 13-15):
    ```
    import { Terminal } from "@xterm/xterm";
    import { FitAddon } from "@xterm/addon-fit";
    import "@xterm/xterm/css/xterm.css";
    ```

    Inside the `useEffect` in `TerminalOverlay` where xterm is initialized (the effect
    starting at line ~306), replace the synchronous `new Terminal(...)` and `new FitAddon()`
    calls with dynamic imports at the top of the effect:
    ```typescript
    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
    ]);
    await import("@xterm/xterm/css/xterm.css");
    ```

    Make the effect callback `async` to support `await`. TypeScript types for `Terminal`
    and `FitAddon` used in refs (`termRef`, `fitAddonRef`) need to remain typed — add
    `import type { Terminal as XTerminal } from "@xterm/xterm"` and
    `import type { FitAddon as XFitAddon } from "@xterm/addon-fit"` as type-only imports
    at the top of the file (type-only imports do not affect bundle). Update the ref types
    accordingly: `useRef<XTerminal | null>(null)` and `useRef<XFitAddon | null>(null)`.

    Verify the build succeeds with no TypeScript errors. The `handlePaste` function
    references `wsRef` not xterm directly, so no other call sites need updating.
    The `TerminalPage` only renders `TerminalOverlay` and doesn't use xterm directly.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run build 2>&1 | tail -30</automated>
  </verify>
  <done>
    No static xterm imports remain at the top of GSD.tsx. Build succeeds. The xterm
    chunk is separate in dist/assets and not included in the main bundle.
  </done>
</task>

</tasks>

<verification>
After both tasks:
1. `npm run build` completes with no errors
2. `npm run test:client` passes
3. In the dist/assets directory, a separate xterm chunk exists (not merged into index JS)
4. `TerminalPage` in GSD.tsx has no `wsBase === undefined` guard
</verification>

<success_criteria>
- Terminal opens immediately on navigation (no network round-trip gate)
- xterm.js is code-split into its own lazy chunk
- "Connecting to terminal..." placeholder shown during xterm canvas initialization
- All existing tests pass, build clean
</success_criteria>

<output>
After completion, create `.planning/quick/34-terminal-still-takes-2-3-seconds-sometim/34-SUMMARY.md`
</output>
