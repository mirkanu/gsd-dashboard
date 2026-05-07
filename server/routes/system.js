const { Router } = require("express");
const os = require("os");
const { execSync } = require("child_process");
const fs = require("fs");

const router = Router();

function readSwap() {
  try {
    const meminfo = fs.readFileSync("/proc/meminfo", "utf8");
    const match = (key) => {
      const m = meminfo.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
      return m ? Math.round(parseInt(m[1]) / 1024) : 0;
    };
    return {
      swap_total_mb: match("SwapTotal"),
      swap_used_mb: match("SwapTotal") - match("SwapFree"),
    };
  } catch {
    return { swap_total_mb: 0, swap_used_mb: 0 };
  }
}

function readDisk() {
  try {
    const out = execSync(
      "df -h --output=target,size,used,avail,pcent 2>/dev/null | tail -n +2",
      { timeout: 3000 }
    ).toString();
    return out
      .trim()
      .split("\n")
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) return null;
        return { mount: parts[0], size: parts[1], used: parts[2], avail: parts[3], pct: parts[4] };
      })
      .filter(Boolean)
      .filter(
        (r) =>
          !r.mount.startsWith("/sys") &&
          !r.mount.startsWith("/proc") &&
          !r.mount.startsWith("/dev/loop") &&
          !r.mount.startsWith("/snap")
      );
  } catch {
    return [];
  }
}

function readProcesses() {
  try {
    const out = execSync("ps aux --sort=-%mem --no-header 2>/dev/null", {
      timeout: 3000,
    }).toString();
    return out
      .trim()
      .split("\n")
      .slice(0, 10)
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        return {
          user: parts[0] ?? "",
          pid: parts[1] ?? "",
          cpu: parts[2] ?? "0",
          mem: parts[3] ?? "0",
          command: parts.slice(10).join(" ").slice(0, 60) || parts[10] || "",
        };
      });
  } catch {
    return [];
  }
}

router.get("/", (_req, res) => {
  const [load1, load5, load15] = os.loadavg();
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;

  res.json({
    cpu: {
      load1: Math.round(load1 * 100) / 100,
      load5: Math.round(load5 * 100) / 100,
      load15: Math.round(load15 * 100) / 100,
    },
    memory: {
      total_mb: Math.round(total / 1024 / 1024),
      used_mb: Math.round(used / 1024 / 1024),
      free_mb: Math.round(free / 1024 / 1024),
      ...readSwap(),
    },
    disk: readDisk(),
    processes: readProcesses(),
  });
});

module.exports = router;
