---
phase: 68
name: portainer-docker-ui
status: planned
created: 2026-05-07
---

# Phase 68 Context: Portainer Docker UI

## Phase Boundary

Install Portainer CE on the Hetzner VPS so all Docker containers can be inspected, restarted,
and log-tailed from a browser. Expose at `portainer.gsdlabs.dev` via the existing Cloudflare
Tunnel.

## Implementation Decisions

### Claude's Discretion

Discuss phase skipped — goal is explicit. Relevant facts:

- VPS: Ubuntu 24.04 LTS, SSH as `claude@37.27.212.18` via `~/.ssh/hetzner_claude`
- Docker orchestration: `/home/services/hetzner-vps/docker-compose.yml`
- Cloudflare Tunnel: remote-managed config (API-side), tunnel ID `093489ad-5644-4b42-a6c6-32c45c244fed`
- Cloudflare Account: `04bc84539b1073de92780f3c7568d273`
- Cloudflare API: X-Auth-Email=manuelkuhs@gmail.com, key in /home/services/.env.production
- Zone ID: `6c322a054d869df9450e4c99e8d4d4a8`
- Portainer CE: run as Docker container, bind mount /var/run/docker.sock
- Port: 9443 (HTTPS) or 9000 (HTTP) — use 9000 for tunnel (avoid cert issues)
- Portainer data: named Docker volume `portainer_data`
- Key learning from Phase 67: tunnel uses remote-managed config, not local YAML ingress

## Success Criteria

- Portainer CE container running and healthy
- `portainer.gsdlabs.dev` returns HTTP 200 (login page)
- Can inspect all running containers from browser
