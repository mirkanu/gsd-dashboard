---
plan: 68-01
phase: 68
status: complete
completed: 2026-05-07
---

# Plan 68-01 Summary: Install Portainer CE + Expose via Cloudflare Tunnel

## Outcome

Portainer CE running and accessible at https://portainer.gsdlabs.dev.

## Steps Taken

1. `docker volume create portainer_data`
2. `docker run -d --name portainer --restart=always -p 9000:9000 -v /var/run/docker.sock:/var/run/docker.sock -v portainer_data:/data portainer/portainer-ce:latest`
3. Added DNS CNAME `portainer.gsdlabs.dev → 093489ad...cfargotunnel.com` via Cloudflare API
4. Updated Cloudflare tunnel remote config via API — version 12 → 13, added portainer ingress rule

## Verification

| Check | Result |
|---|---|
| `docker ps \| grep portainer` | ✅ running, port 9000 |
| `curl -s http://localhost:9000/` | ✅ Portainer HTML (4 matches) |
| DNS CNAME portainer.gsdlabs.dev | ✅ created |
| Cloudflare tunnel remote config | ✅ version 13, portainer ingress added |
| `curl -sI https://portainer.gsdlabs.dev` | ✅ HTTP 200 |
