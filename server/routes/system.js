const { Router } = require("express");
const os = require("os");
const { execSync, execFile } = require("child_process");
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

function readDockerDf() {
  try {
    const out = execSync("docker system df --format '{{json .}}'", { timeout: 5000 }).toString().trim();
    // docker system df --format '{{json .}}' outputs one JSON object per line
    const lines = out.split("\n").filter(Boolean);
    const entries = lines.map((line) => {
      const obj = JSON.parse(line);
      return {
        type: obj.Type,          // "Images", "Containers", "Local Volumes", "Build Cache"
        size: obj.Size,          // e.g. "13.8GB"
        reclaimable: obj.Reclaimable, // e.g. "7.2GB (52%)"
      };
    });
    return { entries, error: null };
  } catch {
    return { entries: [], error: "unavailable" };
  }
}

router.get("/disk-detail", (_req, res) => {
  try {
    const dirs = [
      "/var/log",
      "/home/services",
      "/home/claude/.pm2/logs",
      "/home/services/gsddashboard/data",
      "/home/services/gsddashboard/logs",
    ];
    const results = dirs.map((dir) => {
      try {
        const out = execSync(`du -sh "${dir}" 2>/dev/null`, { timeout: 5000 }).toString().trim();
        const parts = out.split(/\s+/);
        return { dir, size: parts[0] || "?", error: null };
      } catch {
        return { dir, size: null, error: "unavailable" };
      }
    });
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function readOomStatus() {
  try {
    const out = execSync("systemctl is-active earlyoom", { timeout: 3000 }).toString().trim();
    return { earlyoom: out === "active" ? "active" : "inactive" };
  } catch {
    // systemctl exits non-zero when inactive — catch means inactive
    return { earlyoom: "inactive" };
  }
}

router.get("/docker-df", (_req, res) => {
  try {
    res.json(readDockerDf());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/oom-status", (_req, res) => {
  try {
    res.json(readOomStatus());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const CRON_WHITELIST = {
  "docker-prune": {
    schedule: "Sun 4:00 AM",
    logFile: "/var/log/docker-prune.log",
    cmd: "bash",
    args: ["-c", "docker builder prune --keep-storage 2gb -f && docker image prune -f"],
    useSudo: false,
  },
  "prune-old-data": {
    schedule: "Daily 3:00 AM",
    logFile: "/home/claude/.pm2/logs/prune-old-data.log",
    cmd: "node",
    args: ["/home/services/gsddashboard/scripts/prune-old-data.js"],
    useSudo: false,
  },
  "memory-guard": {
    schedule: "Every 5 min",
    logFile: "/home/claude/.pm2/logs/memory-guard.log",
    cmd: "bash",
    args: ["/home/services/gsddashboard/scripts/memory-guard.sh"],
    useSudo: false,
  },
};

router.get("/cron-status", (_req, res) => {
  const result = Object.entries(CRON_WHITELIST).map(([name, cfg]) => {
    let lastRun = null;
    let lastOutput = null;
    try {
      const stat = fs.statSync(cfg.logFile);
      lastRun = stat.mtime.toISOString();
      // Read last 2KB so we don't load huge logs
      const size = stat.size;
      const fd = fs.openSync(cfg.logFile, "r");
      const readSize = Math.min(2048, size);
      const buf = Buffer.alloc(readSize);
      fs.readSync(fd, buf, 0, readSize, Math.max(0, size - readSize));
      fs.closeSync(fd);
      lastOutput = buf.toString("utf8").replace(/^\n/, "");
    } catch {
      // log file absent = never run
    }
    return { name, schedule: cfg.schedule, lastRun, lastOutput, running: false };
  });
  res.json(result);
});

router.post("/run-cron/:name", (req, res) => {
  const { name } = req.params;
  const cfg = CRON_WHITELIST[name];
  if (!cfg) {
    return res.status(400).json({ error: `Unknown cron job: ${name}. Allowed: ${Object.keys(CRON_WHITELIST).join(", ")}` });
  }

  const cmd = cfg.useSudo ? "sudo" : cfg.cmd;
  const args = cfg.useSudo ? [cfg.cmd, ...cfg.args] : cfg.args;

  const child = execFile(cmd, args, { timeout: 60000 }, (err, stdout, stderr) => {
    const output = (stdout || "") + (stderr || "");
    // Write to log file so lastRun timestamp updates (mirrors what cron does)
    try { fs.appendFileSync(cfg.logFile, output); } catch { /* log write failure is non-fatal */ }
    if (err && err.killed) {
      return res.status(504).json({ ok: false, output, error: "Timed out after 60s" });
    }
    res.json({ ok: !err || err.code === 0, output, exitCode: err ? err.code : 0 });
  });

  child.on("error", (e) => {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  });
});

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
