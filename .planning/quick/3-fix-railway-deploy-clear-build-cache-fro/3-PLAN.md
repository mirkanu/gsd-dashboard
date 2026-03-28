---
phase: quick-3
plan: 3
type: execute
wave: 1
depends_on: []
files_modified:
  - Dockerfile
autonomous: true
requirements: [QUICK-3]
must_haves:
  truths:
    - "Railway builds from a fresh image with no stale layer cache"
    - "The deployed app reflects current code on master"
  artifacts:
    - path: "Dockerfile"
      provides: "Updated cache-bust timestamp to invalidate Railway build cache"
  key_links:
    - from: "Dockerfile cache-bust comment"
      to: "Railway build layer cache"
      via: "Layer invalidation on COPY instruction"
      pattern: "cache-bust: \\d{4}-\\d{2}-\\d{2}"
---

<objective>
Force Railway to discard its cached Docker layers and rebuild the image from scratch by bumping the cache-bust timestamp in the Dockerfile, then deploy.

Purpose: Railway caches Docker build layers. When cached layers produce a broken image (stale deps, wrong build output), the fastest fix is to invalidate the cache by changing a comment before the relevant COPY/RUN instructions, then redeploy.

Output: Updated Dockerfile committed + pushed + deployed to Railway with a verified live response.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/3-fix-railway-deploy-clear-build-cache-fro/3-PLAN.md

Railway project:
- URL: https://gsd-dashboard-production.up.railway.app
- Deploy command: RAILWAY_API_TOKEN=$(grep RAILWAY_API_TOKEN /data/home/gsddashboard/.env | cut -d= -f2) railway up --detach
- Token env var: RAILWAY_API_TOKEN (from /data/home/gsddashboard/.env)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Bump cache-bust timestamp in Dockerfile and deploy</name>
  <files>Dockerfile</files>
  <action>
    1. Read the current Dockerfile. It already has a `# cache-bust:` comment in Stage 2 (client-build). Update that comment to today's timestamp with a new suffix to ensure Railway invalidates the cached layer, e.g.:
       `# cache-bust: 2026-03-28T18`
       (increment the hour or add a letter suffix like `T17b` if the hour is the same)

    2. Add a second cache-bust comment in Stage 1 (server-deps) immediately before the `RUN npm ci --omit=dev` line as well, to ensure both stages get fresh installs:
       `# cache-bust: 2026-03-28T18`

    3. Commit the change:
       `git add Dockerfile && git commit -m "fix: bump Dockerfile cache-bust to force Railway rebuild"`

    4. Push to master:
       `git push origin master`

    5. Deploy to Railway:
       `RAILWAY_API_TOKEN=$(grep RAILWAY_API_TOKEN /data/home/gsddashboard/.env | cut -d= -f2) railway up --detach`

    6. Wait ~3 minutes, then verify the live URL responds:
       `curl -s -o /dev/null -w "%{http_code}" https://gsd-dashboard-production.up.railway.app`

    Expected: HTTP 200 or 302.
  </action>
  <verify>
    <automated>curl -s -o /dev/null -w "%{http_code}" https://gsd-dashboard-production.up.railway.app</automated>
  </verify>
  <done>Dockerfile has updated cache-bust timestamp committed and pushed. Railway deployment triggered. Live URL returns HTTP 200 or 302.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Forced Railway rebuild by invalidating Docker layer cache and redeploying via `railway up --detach`.</what-built>
  <how-to-verify>
    1. Visit https://gsd-dashboard-production.up.railway.app
    2. Confirm the dashboard loads (project cards visible, no error page)
    3. If Railway is still building, check progress at https://railway.app/project/2415b1c4-c414-4d3c-bd13-6ca1d5ed3750
  </how-to-verify>
  <resume-signal>Type "approved" if dashboard loads, or describe what you see if it still fails</resume-signal>
</task>

</tasks>

<verification>
- Dockerfile has a fresh cache-bust timestamp (both stage 1 and stage 2)
- Commit exists: `git log --oneline -1` shows the cache-bust bump
- `railway up --detach` completed without error
- `curl https://gsd-dashboard-production.up.railway.app` returns 200
</verification>

<success_criteria>
Railway redeploys from a clean build (no stale layers). The live dashboard at https://gsd-dashboard-production.up.railway.app loads successfully.
</success_criteria>

<output>
After completion, create `.planning/quick/3-fix-railway-deploy-clear-build-cache-fro/3-SUMMARY.md`
</output>
