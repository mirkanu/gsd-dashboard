---
phase: quick
plan: 260617-dmd
type: execute
wave: 1
depends_on: []
files_modified: [client/src/components/UploadPanel.tsx, server/routes/upload.js]
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - "User sees 'max 100MB' limit text in upload panel"
    - "Upload fails with error message when file exceeds 100MB"
    - "User can click 'Upload >100MB' button to see FTP login details"
    - "Server rejects files larger than 100MB (currently 1GB)"
  artifacts:
    - path: "client/src/components/UploadPanel.tsx"
      provides: "Upload UI with file size validation and FTP modal"
      min_lines: 240
    - path: "server/routes/upload.js"
      provides: "File upload endpoint with 100MB limit enforcement"
      contains: "MAX_FILE_SIZE = 100MB"
  key_links:
    - from: "client/src/components/UploadPanel.tsx"
      to: "/api/upload"
      via: "XMLHttpRequest POST"
      pattern: "xhr.open\\(.*POST.*api/upload"
---

<objective>
Update UploadPanel to display 100MB file limit, show error for oversized files, provide FTP login details for large files, and enforce 100MB limit server-side.

Purpose: Improve user experience by making file size limits explicit and providing alternative (FTP) for large files.
Output: UploadPanel with limit text, error handling, FTP modal, and server-side enforcement.
</objective>

<execution_context>
@/data/home/gsddashboard/.claude/get-shit-done/workflows/execute-plan.md
@/data/home/gsddashboard/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@/home/services/gsddashboard/CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update UploadPanel UI with file size limit and FTP modal</name>
  <files>client/src/components/UploadPanel.tsx</files>
  <action>Add state for FTP modal (showFtpModal boolean, copiedFtp boolean). Add "max 100MB" text below drop zone when idle. Add file size validation in handleFile: check file.size > 100 * 1024 * 1024, if so show error state with message "File too large (max 100MB)" and display "Upload >100MB via FTP" button. When FTP button clicked, open modal showing FTP login details (host, username, password instructions - these should be in a modal/dialog). Add copy button for FTP credentials. Use existing error/reset state patterns but extend for oversized file case.</action>
  <verify>
    <automated>npm run test:client 2>&1 | head -20</automated>
  </verify>
  <done>UploadPanel shows "max 100MB" text, validates file size client-side, shows error with FTP button for oversized files, and displays FTP credentials in modal</done>
</task>

<task type="auto">
  <name>Task 2: Restore 100MB file size limit in upload route</name>
  <files>server/routes/upload.js</files>
  <action>Change MAX_FILE_SIZE from 1GB (1024 * 1024 * 1024) to 100MB (100 * 1024 * 1024). Update the error message in fileStream.on('limit') handler from "File too large (max 1GB)" to "File too large (max 100MB)". This ensures server-side enforcement matches the UI limits.</action>
  <verify>
    <automated>npm run test:server 2>&1 | head -20</automated>
  </verify>
  <done>Server-side upload route enforces 100MB limit and returns appropriate error message</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client→server | Untrusted file size claim crosses here |
| client storage | FTP credentials stored in client code |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | T | UploadPanel.tsx FTP credentials display | accept | FTP is inherently weak; credentials are for localhost dev use, not production. Accept risk. |
| T-quick-02 | T | File size validation client-side | mitigate | Server-side MAX_FILE_SIZE enforcement (Task 2) prevents bypass. |
| T-quick-03 | I | File upload via /api/upload | accept | Single-user dashboard, uploaded files served from static /uploads, no execution. Accept risk. |
</threat_model>

<verification>
- Build client: `cd client && npx vite build`
- Restart server: `pm2 restart gsd-dashboard`
- UploadPanel shows "max 100MB" text
- File >100MB triggers error with FTP button
- FTP modal shows credentials with copy button
- Server rejects >100MB files with 413 status
</verification>

<success_criteria>
- UploadPanel displays "max 100MB" limit text clearly
- Client-side validation catches oversized files before upload
- Oversized file error state includes "Upload >100MB via FTP" button
- FTP modal displays login details with functional copy button
- Server enforces 100MB limit (busboy limits.fileSize)
- Error messages are consistent between client and server
</success_criteria>

<output>
After completion, create `.planning/quick/260617-dmd-modify-the-dashboard-uploadpanel-to-1-di/260617-dmd-SUMMARY.md`
</output>
