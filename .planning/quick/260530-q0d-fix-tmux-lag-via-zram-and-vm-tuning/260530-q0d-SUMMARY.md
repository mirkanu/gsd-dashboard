---
phase: quick
plan: 260530-q0d
subsystem: system-administration
tags: [zram, swap, sysctl, vm-tuning, tmux-lag, performance]
dependency_graph:
  requires: []
  provides: [zram-swap-at-priority-100, vm-swap-tuning]
  affects: [system-memory, swap-behavior, tmux-responsiveness]
tech_stack:
  added: [linux-modules-extra, zram-kernel-module]
  patterns: [systemd-oneshot-service, sysctl.d-config]
key_files:
  created:
    - /etc/sysctl.d/99-swap-tuning.conf
    - /etc/systemd/system/zram-swap.service
    - /etc/modules-load.d/zram.conf
    - /home/services/hetzner-vps/docs/swap-tuning.md
  modified: []
decisions:
  - Used custom zram-swap.service at priority 100 instead of zram-config package (priority 5 too low)
  - Added 1s sleep in ExecStart/ExecStop to avoid zramctl device-busy race on rapid restart
  - Installed linux-modules-extra-6.8.0-117-generic to get zram kernel module (not in base kernel)
metrics:
  duration: "592 seconds (~10 minutes)"
  completed: "2026-05-30T18:57:30Z"
  tasks_completed: 3
  files_created: 4
---

# Quick Task 260530-q0d: Fix tmux lag via zram and VM tuning

zram 1.9GB lz4 device at priority 100 + vm.swappiness=10 + vm.page-cluster=0, persistent via systemd, docs committed to hetzner-vps repo.

## Tasks Completed

| Task | Name | Status | Key Outputs |
|------|------|--------|-------------|
| 1 | Apply VM kernel tuning via sysctl | Done | /etc/sysctl.d/99-swap-tuning.conf applied live |
| 2 | Set up zram swap device (persistent) | Done | /dev/zram0 active at priority 100, service enabled |
| 3 | Document in hetzner-vps repo and commit | Done | 2548ec0 in hetzner-vps master |

## Verification Results

```
swappiness: 10        (was 60)
page-cluster: 0       (was 3)
vfs_cache_pressure: 50 (was 100)

NAME       TYPE      SIZE   USED PRIO
/swapfile  file        4G   3.9G   -2
/dev/zram0 partition 1.9G    0B  100

systemctl is-active zram-swap.service  → active
systemctl is-enabled zram-swap.service → enabled
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] zram kernel module not installed**
- **Found during:** Task 2 — `modprobe zram` returned "Module not found"
- **Issue:** The `zram` kernel module is in `linux-modules-extra` package, which was not installed on this VPS
- **Fix:** Installed `linux-modules-extra-6.8.0-117-generic` via apt-get, then modprobe succeeded
- **Files modified:** None (system package)

**2. [Rule 1 - Bug] zram service restart race condition**
- **Found during:** Task 2 verification — stop+start cycle caused "Device or resource busy"
- **Issue:** After ExecStop swapoff'd and reset zram0, the next ExecStart ran immediately and `zramctl --find` found the device still in kernel's "busy" state
- **Fix:** Added `sleep 1` at start of ExecStart (after modprobe) and `sleep 1` in ExecStop (after swapoff, before zramctl reset) to allow kernel to release device
- **Files modified:** /etc/systemd/system/zram-swap.service

**3. [Rule 2 - Missing] zram module not persistent across reboots**
- **Found during:** Task 2 — service handles modprobe at start, but best practice is to also declare in modules-load.d
- **Fix:** Created /etc/modules-load.d/zram.conf with "zram" to ensure module is available early in boot
- **Files modified:** /etc/modules-load.d/zram.conf (new)

## Decisions Made

- **zram-config package skipped:** Installed but creates device at priority 5 (plan requires 100). Used custom systemd service instead.
- **zram-config not removed:** Package left installed (harmless since its service is inactive). Can be removed with `apt-get remove zram-config`.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| /etc/sysctl.d/99-swap-tuning.conf | FOUND |
| /etc/systemd/system/zram-swap.service | FOUND |
| /etc/modules-load.d/zram.conf | FOUND |
| /home/services/hetzner-vps/docs/swap-tuning.md | FOUND |
| hetzner-vps commit 2548ec0 | FOUND |
| vm.swappiness=10 in /proc | CONFIRMED |
| vm.page-cluster=0 in /proc | CONFIRMED |
| /dev/zram0 at priority 100 in swapon | CONFIRMED |
| zram-swap.service active+enabled | CONFIRMED |
