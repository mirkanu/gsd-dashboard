---
plan: 67-01
phase: 67
status: complete
completed: 2026-05-07
---

# Plan 67-01 Summary: Install Cockpit + Expose via Cloudflare Tunnel

## Outcome

Cockpit installed and publicly accessible at https://cockpit.gsdlabs.dev.

## Key Finding

The Cloudflare Tunnel uses **remote-managed ingress configuration** (API version 11→12), not
the local `config.yml` ingress block. The local YAML ingress rules are ignored by the tunnel
at runtime — cloudflared fetches ingress from Cloudflare's API when it has remote management
enabled (as of cloudflared 2026.3.0). Added cockpit via Cloudflare API PUT request to
`/accounts/{id}/cfd_tunnel/{id}/configurations`.

`cloudflared tunnel route dns` cannot add DNS records without cert.pem (global auth), but the
Cloudflare API (X-Auth-Email + X-Auth-Key) works as a fallback.

## Steps Taken

1. `sudo apt-get install -y cockpit` on VPS
2. `sudo systemctl enable --now cockpit.socket`
3. Updated `/home/claude/.cloudflare-tunnel/config.yml` with cockpit entry (local, for reference)
4. Added DNS CNAME `cockpit.gsdlabs.dev → 093489ad...cfargotunnel.com` via Cloudflare API
5. Updated Cloudflare tunnel remote config via API (PUT /cfd_tunnel/{id}/configurations) — version 11 → 12
6. Tunnel auto-reloaded remote config within ~30s; verified HTTP 200

## Verification

| Check | Result |
|---|---|
| `systemctl is-active cockpit.socket` on VPS | ✅ active |
| `curl -sk https://localhost:9090/` on VPS | ✅ Cockpit HTML |
| `curl -sI https://cockpit.gsdlabs.dev` | ✅ HTTP 200, Cockpit CSP headers |
| DNS CNAME cockpit.gsdlabs.dev | ✅ created via API |
| Cloudflare tunnel remote config | ✅ version 12 with cockpit ingress |
