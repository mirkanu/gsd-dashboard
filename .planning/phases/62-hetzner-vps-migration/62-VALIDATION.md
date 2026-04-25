---
phase: 62
slug: hetzner-vps-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-25
---

# Phase 62 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual integration tests (infrastructure phase — no unit test framework applies) |
| **Config file** | none |
| **Quick run command** | `docker compose ps` + `curl -f http://localhost:{port}/health` |
| **Full suite command** | See Manual-Only Verifications table |
| **Estimated runtime** | ~5 minutes (manual checks across all services) |

---

## Sampling Rate

- **After every task commit:** Run `docker compose ps` to confirm containers healthy
- **After every plan wave:** Full service health check (curl each service endpoint)
- **Before `/gsd-verify-work`:** Full suite must be green (all services responding, all DBs accessible)
- **Max feedback latency:** 300 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 62-01-01 | 01 | 1 | VPS provisioned | — | SSH access restricted to key-only | manual | `ssh hetzner-vps "echo ok"` | ✅ | ⬜ pending |
| 62-01-02 | 01 | 1 | Docker installed | — | Docker daemon running | automated | `ssh hetzner-vps "docker --version"` | ✅ | ⬜ pending |
| 62-02-01 | 02 | 2 | GSD Dashboard running | — | Process responds on port 4820 | automated | `curl -f http://localhost:4820/api/health` | ✅ | ⬜ pending |
| 62-02-02 | 02 | 2 | Cloudflare Tunnel active | — | gsdlabs.dev subdomain resolves | manual | `curl -f https://dashboard.gsdlabs.dev/api/health` | ✅ | ⬜ pending |
| 62-03-01 | 03 | 2 | Debates deployed | — | Service responds | automated | `curl -f http://localhost:{debates-port}/` | ✅ | ⬜ pending |
| 62-04-01 | 04 | 2 | Ynab deployed | — | Next.js responds | automated | `curl -f http://localhost:{ynab-port}/api/health` | ✅ | ⬜ pending |
| 62-04-02 | 04 | 2 | Ynab PostgreSQL accessible | — | DB connection succeeds | automated | `docker exec ynab-db psql -U ynab -c "SELECT 1"` | ✅ | ⬜ pending |
| 62-05-01 | 05 | 3 | KidAI deployed | — | Admin responds | automated | `curl -f http://localhost:{kidai-port}/` | ✅ | ⬜ pending |
| 62-05-02 | 05 | 3 | image-search-mcp sidecar running | — | MCP responds | automated | `docker compose ps image-search-mcp` | ✅ | ⬜ pending |
| 62-06-01 | 06 | 3 | pg_dump backup runs | — | Dumps uploaded to B2 | manual | Check B2 bucket for today's dump files | ✅ | ⬜ pending |
| 62-07-01 | 07 | 4 | Railway services removed | — | Railway dashboard shows services deleted | manual | Log into Railway dashboard | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- None required — this is an infrastructure phase with no application code changes. All validation is via shell commands against live services.

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hetzner VPS created with CAX21 spec | D-01 | Requires Hetzner Cloud console or API check | Verify `hcloud server list` shows CAX21 instance |
| All DNS subdomains resolve via Cloudflare Tunnel | D-01 | Requires live DNS + tunnel running | curl each subdomain from external network |
| Railway services cancelled | D-04 | Requires Railway dashboard access | Log in, confirm all services removed/paused |
| Backblaze B2 backup files present | D-06 | Requires B2 console or rclone check | `rclone ls b2:{bucket}` shows dump files |
| Parallel run complete (no Railway regressions) | D-04 | Requires ~1 week of dual operation | User confirms both environments healthy before cutover |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or manual test instructions
- [ ] Sampling continuity: docker compose ps after every infrastructure task
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter once all tasks verified

**Approval:** pending
