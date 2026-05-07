---
phase: 67
name: cockpit-vps-monitoring
status: planned
created: 2026-05-07
---

# Phase 67 Context: Cockpit VPS Monitoring

## Phase Boundary

Install and expose Cockpit on the Hetzner VPS so there's a browser-accessible server admin UI
at `VPS-IP:9090` (or behind Cloudflare Tunnel) showing CPU load, RAM, disk usage, running
processes, systemd units, and journal logs — without needing SSH for routine health checks.

## Implementation Decisions

### Claude's Discretion

Discuss phase skipped — goal is explicit. Relevant facts:

- VPS: Ubuntu 24.04 LTS, Hetzner VPS, IP 37.27.212.18
- SSH: `claude@37.27.212.18` via `~/.ssh/hetzner_claude`
- Cloudflare Tunnel: named tunnel `gsd-dashboard`, config at `/home/claude/.cloudflare-tunnel/config.yml`
- Existing tunnel ingress: dashboard, debates, ynab, kidai, zoho-sync, librechat subdomains on gsdlabs.dev
- Cockpit access: expose on port 9090 locally; optionally add `cockpit.gsdlabs.dev` tunnel ingress

## Success Criteria

- `cockpit.socket` systemd unit enabled and active on VPS
- Cockpit reachable at `https://37.27.212.18:9090` or via Cloudflare Tunnel subdomain
- CPU, RAM, disk, processes visible in browser
- No firewall changes needed (Hetzner firewall already open for port 9090 if applicable)

## Deferred

- Deep customization of Cockpit plugins
- Integration with GSD Dashboard (that's Phase 69)
