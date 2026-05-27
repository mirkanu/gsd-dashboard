---
phase: quick-260527-pfk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server/routes/upload.js
  - server/index.js
  - client/src/components/UploadPanel.tsx
  - client/src/components/Sidebar.tsx
autonomous: true
requirements: [PFK-01]

must_haves:
  truths:
    - "User can paste or drag-drop an image/file in the Upload panel and receive a localhost URL"
    - "User can pick a file via file picker button (works on iOS)"
    - "After upload, a Copy URL button is visible and copies to clipboard on tap (iOS-safe)"
    - "Copy button briefly shows 'Copied ✓' after tap then resets"
    - "Uploaded files are served at GET /uploads/:file from disk"
    - "Panel is visible in the sidebar (desktop + mobile)"
  artifacts:
    - path: "server/routes/upload.js"
      provides: "POST /api/upload multipart handler + GET /uploads/:file static serving"
    - path: "client/src/components/UploadPanel.tsx"
      provides: "Paste / drag-drop / file-picker UI + result URL display + Copy URL button"
    - path: "client/src/components/Sidebar.tsx"
      provides: "UploadPanel mounted in sidebar nav section"
  key_links:
    - from: "client/src/components/UploadPanel.tsx"
      to: "POST /api/upload"
      via: "fetch with FormData"
      pattern: "fetch.*api/upload"
    - from: "server/index.js"
      to: "server/routes/upload.js"
      via: "app.use('/api/upload') + app.use('/uploads', express.static(uploadsDir))"
      pattern: "upload"
---

<objective>
Add an Upload panel to the GSD Dashboard sidebar.

Purpose: Allow pasting or picking a file from any device (including iOS) to get a shareable
localhost URL that Claude Code (running on the same server) can reference.

Output:
- server/routes/upload.js — multipart POST + static serving wired into index.js
- client/src/components/UploadPanel.tsx — paste/drag/pick UI with iOS-safe Copy URL
- Sidebar.tsx updated to mount UploadPanel below the divider before Settings
</objective>

<execution_context>
@/data/home/gsddashboard/.claude/get-shit-done/workflows/execute-plan.md
@/data/home/gsddashboard/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/home/services/gsddashboard/CLAUDE.md
@/home/services/gsddashboard/server/index.js
@/home/services/gsddashboard/client/src/components/Sidebar.tsx

<interfaces>
<!-- Express server wiring pattern (from server/index.js) -->
// Route registration pattern:
const uploadRouter = require("./routes/upload");
app.use("/api/upload", uploadRouter);
// Static serving pattern (add before SPA catch-all at line ~181):
app.use("/uploads", express.static(uploadsDir));

<!-- Sidebar component pattern (from Sidebar.tsx) -->
// Add import at top; mount as a collapsible inline section in <nav>
// Use slim (collapsed && !isMobile) to hide label when collapsed
// Divider pattern: <div className="border-t border-border/50 my-2" />
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Server — upload route + static serving</name>
  <files>server/routes/upload.js, server/index.js</files>
  <action>
Create /home/services/gsddashboard/server/routes/upload.js:

- Use Node built-ins only (no multer — it's not in package.json). Use the `busboy`
  package if available, otherwise use multipart parsing via a raw stream approach.
  FIRST check: `node -e "require('busboy')"` — if it resolves, use busboy.
  If busboy is absent, use the `formidable` package check similarly.
  If neither is installed, install busboy: `npm install busboy --save` in the project root.

- POST handler logic:
  1. Parse multipart/form-data to extract the uploaded file (field name: "file")
  2. Generate an 8-char random slug: `crypto.randomBytes(4).toString('hex')`
  3. Preserve original file extension (e.g. `.png`, `.jpg`, `.txt`), fallback to `.bin`
  4. Ensure uploads directory exists: `fs.mkdirSync('/home/services/gsddashboard/uploads', { recursive: true })`
  5. Write file to `/home/services/gsddashboard/uploads/{slug}.{ext}`
  6. Return JSON: `{ url: "http://localhost:4820/uploads/{slug}.{ext}" }`
  7. On error: return 500 `{ error: "Upload failed" }`

In server/index.js, add after the existing route registrations (before the SPA catch-all):
  ```js
  const uploadRouter = require("./routes/upload");
  const uploadsDir = path.join(__dirname, "../uploads");
  app.use("/api/upload", uploadRouter);
  app.use("/uploads", express.static(uploadsDir));
  ```

The /uploads static serve must mount BEFORE the SPA catch-all (`express.static(clientDist)`)
to avoid the catch-all intercepting file requests.

Run `npm run test:server` after implementation. If any pre-existing tests fail unrelated
to this change, note them but do not fix them.
  </action>
  <verify>
    <automated>
      cd /home/services/gsddashboard && npm run test:server 2>&1 | tail -20
    </automated>
    Manual smoke: curl -X POST http://localhost:4820/api/upload -F "file=@/etc/hostname" should return JSON with a localhost URL.
  </verify>
  <done>POST /api/upload returns { url } with a valid localhost:4820 path; GET /uploads/{file} serves the file; npm test:server passes.</done>
</task>

<task type="auto">
  <name>Task 2: Client — UploadPanel component + Sidebar integration</name>
  <files>client/src/components/UploadPanel.tsx, client/src/components/Sidebar.tsx</files>
  <action>
Create /home/services/gsddashboard/client/src/components/UploadPanel.tsx:

State: `{ status: 'idle' | 'uploading' | 'done' | 'error', url: string | null, copied: boolean }`

UI structure (always visible inline in sidebar, not a modal):
- Section header: small label "Upload" with Upload icon (lucide-react `Upload` or `Paperclip`)
- Drop zone div:
  - Accepts onDrop and onPaste events
  - onDrop: call handleFile(e.dataTransfer.files[0])
  - onPaste: call handleFile(e.clipboardData.files[0]) — only fires if user pastes while
    focus is inside the drop zone or its children
  - onClick: programmatically click a hidden <input type="file" accept="*/*" />
  - Appearance: dashed border, "Paste or drop file" text, tap to pick label
  - While uploading: show a spinner or "Uploading..." text
- After upload success (status === 'done'):
  - Show URL in a small truncated text box (monospace, max-w overflow-hidden text-ellipsis)
  - Show "Copy URL" button below it
  - **iOS-safe clipboard copy:** The button's onClick handler MUST call
    `navigator.clipboard.writeText(url)` SYNCHRONOUSLY inside the handler itself —
    do NOT use .then() chaining from an async upload result. The state `url` is already
    stored in component state at click time, so the handler is:
    ```tsx
    const handleCopy = () => {
      if (!url) return;
      navigator.clipboard.writeText(url).catch(() => {
        // Fallback: select + execCommand for older iOS
        const el = document.createElement('textarea');
        el.value = url;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    ```
  - Button label: copied ? "Copied ✓" : "Copy URL"
- Error state: small red "Upload failed" message + retry option (click to reset to idle)
- "Upload another" link when status === 'done' resets to idle

Styling: match Sidebar dark theme — use `text-gray-400`, `bg-surface-3`, `border-border`,
`text-accent` for the copy button active state. Keep compact (fits in 60px-wide collapsed
sidebar — hide the full panel body when `slim` prop is true, show only the Upload icon).

Props interface:
```tsx
interface UploadPanelProps {
  slim?: boolean;
}
```

handleFile function:
1. If no file, return
2. Set status to 'uploading'
3. const fd = new FormData(); fd.append('file', file)
4. const res = await fetch('/api/upload', { method: 'POST', body: fd })
5. const data = await res.json()
6. If res.ok: set status 'done', url = data.url
7. Else: set status 'error'

In Sidebar.tsx:
- Import UploadPanel and `Upload` icon from lucide-react at the top
- Add the Upload icon to the lucide imports line
- After the existing "Settings" NavItem (just before the closing </nav>), add:
  ```tsx
  {/* Divider */}
  {!slim && <div className="border-t border-border/50 my-2" />}
  {slim && <div className="my-1" />}

  {/* Upload panel */}
  {!slim && <UploadPanel slim={false} />}
  {slim && (
    <div className="flex items-center justify-center px-2 py-2.5 text-gray-500" title="Upload">
      <Upload className="w-4 h-4 flex-shrink-0" />
    </div>
  )}
  ```

Run `npm run test:client` after implementation.
  </action>
  <verify>
    <automated>
      cd /home/services/gsddashboard && npm run test:client 2>&1 | tail -20
    </automated>
    Manual: Open dashboard, confirm Upload panel visible in sidebar below Settings. Paste an image or pick a file. URL appears. Tap Copy URL — clipboard receives the URL.
  </verify>
  <done>UploadPanel renders in sidebar; file upload returns URL; Copy URL button copies synchronously; copied state resets after 2s; slim mode shows icon only; npm test:client passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → POST /api/upload | User-supplied multipart data crosses into server filesystem |
| GET /uploads/:file | Any file stored in uploads dir is publicly served |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-pfk-01 | Spoofing | POST /api/upload | accept | cookieAuth already guards all /api/* routes (server/index.js line 110); no unauthenticated access |
| T-pfk-02 | Tampering | server filesystem | mitigate | Write only to /home/services/gsddashboard/uploads/ (fixed dir, not path-traversal-possible); slug is hex-only, extension extracted via path.extname |
| T-pfk-03 | Information Disclosure | GET /uploads/:file | accept | URL is ephemeral + 8-char random slug; internal localhost only; no directory listing (express.static does not enable it by default) |
| T-pfk-04 | Denial of Service | POST /api/upload | mitigate | Limit file size in upload handler (e.g. 50MB cap); busboy/formidable both support limits config |
| T-pfk-05 | Elevation of Privilege | static serve | accept | Files served read-only by express.static; no execution path |
</threat_model>

<verification>
1. `npm run test:server` passes with no new failures
2. `npm run test:client` passes with no new failures
3. curl smoke test: POST a file → JSON { url } returned
4. Browser: Upload panel visible in sidebar; file upload flow works end to end
5. Copy URL button copies to clipboard on click (no async gap)
</verification>

<success_criteria>
- POST /api/upload accepts multipart, saves to /home/services/gsddashboard/uploads/, returns { url }
- GET /uploads/:file serves the file
- UploadPanel renders in sidebar (expanded = full panel; collapsed = icon only)
- Paste, drag-drop, and file picker all trigger upload
- Copy URL button is synchronous (iOS-safe); shows "Copied ✓" for 2s then resets
- Both test suites pass
</success_criteria>

<output>
After completion, create `.planning/quick/260527-pfk-add-upload-panel-to-dashboard-sidebar/260527-pfk-SUMMARY.md`
</output>
