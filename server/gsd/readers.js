/**
 * GSD planning file readers.
 * Parses ROADMAP.md, STATE.md, and REQUIREMENTS.md from a project's .planning/ directory.
 * No external dependencies — pure Node.js fs + regex.
 */

const fs = require("fs");
const path = require("path");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function planningPath(root, ...segments) {
  return path.join(root, ".planning", ...segments);
}

// ─── STATE.md ────────────────────────────────────────────────────────────────

/**
 * Parses STATE.md. Handles two formats:
 *   1. YAML frontmatter (gsd_state_version: 1.0) — josie, debates, reforma
 *   2. Pure markdown sections — gsddashboard (older format)
 */
function readState(root) {
  const raw = readFile(planningPath(root, "STATE.md"));
  if (!raw) return null;

  if (raw.startsWith("---")) {
    return parseStateWithFrontmatter(raw);
  }
  return parseStateMarkdown(raw);
}

function parseStateWithFrontmatter(raw) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return parseStateMarkdown(raw);

  const fm = fmMatch[1];
  const get = (key) => {
    const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
  };
  const getInt = (key) => {
    const v = get(key);
    return v ? parseInt(v, 10) : null;
  };

  // Nested progress block
  const progressMatch = fm.match(/^progress:\s*\n((?:[ \t]+.+\n?)*)/m);
  let progress = { percent: null, completed_phases: null, total_phases: null, completed_plans: null, total_plans: null };
  if (progressMatch) {
    const block = progressMatch[1];
    const pget = (key) => {
      const m = block.match(new RegExp(`${key}:\\s*(\\d+)`));
      return m ? parseInt(m[1], 10) : null;
    };
    progress = {
      percent: pget("percent"),
      completed_phases: pget("completed_phases"),
      total_phases: pget("total_phases"),
      completed_plans: pget("completed_plans"),
      total_plans: pget("total_plans"),
    };
  }

  // Current position from markdown body (after frontmatter)
  const body = raw.slice(raw.indexOf("---", 3) + 3);
  const lastActivity = extractLastActivity(body) || get("last_activity");
  const blockers = extractBlockers(body);
  const currentPhase = extractCurrentPhase(body);

  return {
    milestone: get("milestone"),
    milestone_name: get("milestone_name"),
    status: get("status"),
    current_phase: currentPhase,
    last_activity: lastActivity,
    progress,
    blockers,
    next_action: extractNextAction(body),
  };
}

function parseStateMarkdown(raw) {
  // Extract from "Current Position" section
  const phaseMatch = raw.match(/^Phase:\s*(.+)$/m);
  const planMatch = raw.match(/^Plan:\s*(.+)$/m);
  const statusMatch = raw.match(/^Status:\s*(.+)$/m);
  const progressBarMatch = raw.match(/Progress:\s*\[.*?\]\s*(\d+)%/);
  const lastActivity = extractLastActivity(raw);
  const blockers = extractBlockers(raw);

  const totalPhasesMatch = phaseMatch && phaseMatch[1].match(/(\d+)\s+of\s+(\d+)/);
  const totalPlansMatch = planMatch && planMatch[1].match(/(\d+)\s+of\s+(\d+)/);

  return {
    milestone: null,
    milestone_name: null,
    status: statusMatch ? statusMatch[1].trim() : null,
    current_phase: phaseMatch ? phaseMatch[1].trim() : null,
    last_activity: lastActivity,
    progress: {
      percent: progressBarMatch ? parseInt(progressBarMatch[1], 10) : null,
      completed_phases: totalPhasesMatch ? parseInt(totalPhasesMatch[1], 10) : null,
      total_phases: totalPhasesMatch ? parseInt(totalPhasesMatch[2], 10) : null,
      completed_plans: totalPlansMatch ? parseInt(totalPlansMatch[1], 10) : null,
      total_plans: totalPlansMatch ? parseInt(totalPlansMatch[2], 10) : null,
    },
    blockers,
    next_action: extractNextAction(raw),
  };
}

function extractLastActivity(text) {
  const m = text.match(/^Last activity:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

function extractCurrentPhase(text) {
  const m = text.match(/^Phase:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

function extractBlockers(text) {
  // Find "Blockers" section and collect non-empty bullet items
  const sectionMatch = text.match(/##+ Blockers[^\n]*\n([\s\S]*?)(?=\n##|\n#|$)/i);
  if (!sectionMatch) return [];
  const lines = sectionMatch[1].split("\n");
  return lines
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l && !l.match(/^-+$/) && !l.match(/^none/i) && !l.startsWith("#"));
}

function extractNextAction(text) {
  const m = text.match(/^Next action:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

// ─── ROADMAP.md ───────────────────────────────────────────────────────────────

/**
 * Parses ROADMAP.md progress table to extract phase list with completion status.
 */
function readRoadmap(root) {
  const raw = readFile(planningPath(root, "ROADMAP.md"));
  if (!raw) return null;

  const phases = parseRoadmapProgressTable(raw);
  if (phases.length === 0) {
    // Fallback: parse checkbox phase list
    return { phases: parseRoadmapCheckboxes(raw) };
  }
  return { phases };
}

function parseRoadmapProgressTable(raw) {
  // Find the progress/status table — look for a table with "Plans" and "Status" columns
  const tableMatch = raw.match(/\|[-| ]+\|\n((?:\|.+\|\n?)+)/g);
  if (!tableMatch) return [];

  for (const tableBlock of tableMatch) {
    // Find the header row preceding this separator row
    const lines = raw.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^\|[-| ]+\|$/) && i > 0) {
        const header = lines[i - 1];
        if (!header.includes("Plans") && !header.includes("Status")) continue;

        // Parse column indices
        const cols = header.split("|").map((c) => c.trim().toLowerCase());
        const phaseIdx = cols.findIndex((c) => c === "phase");
        const plansIdx = cols.findIndex((c) => c.includes("plan"));
        const statusIdx = cols.findIndex((c) => c === "status");

        if (phaseIdx === -1) continue;

        const phases = [];
        for (let j = i + 1; j < lines.length; j++) {
          const row = lines[j];
          if (!row.startsWith("|")) break;
          const cells = row.split("|").map((c) => c.trim());

          const phaseName = cells[phaseIdx] || "";
          if (!phaseName || phaseName.match(/^[-\s]*$/)) continue;

          const plansStr = plansIdx !== -1 ? cells[plansIdx] || "" : "";
          const status = statusIdx !== -1 ? cells[statusIdx] || "" : "";

          // Parse "N/M" plans string
          const plansMatch = plansStr.match(/(\d+)\s*\/\s*(\d+|TBD|\?)/i);
          const plans_done = plansMatch ? parseInt(plansMatch[1], 10) : null;
          const plans_total = plansMatch && !isNaN(parseInt(plansMatch[2], 10)) ? parseInt(plansMatch[2], 10) : null;

          phases.push({
            name: phaseName.replace(/^\d+\.\s*/, ""),
            plans_done,
            plans_total,
            status: normalizeStatus(status),
          });
        }

        if (phases.length > 0) return phases;
      }
    }
  }
  return [];
}

function parseRoadmapCheckboxes(raw) {
  // Fallback: parse "- [x] Phase N: Name" style lines
  const phases = [];
  const re = /^[-*]\s+\[([ xX])\]\s+\*?\*?Phase\s+(\d+)[:\s]+([^*\n]+)/gm;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const done = m[1].toLowerCase() === "x";
    phases.push({
      name: m[3].trim().replace(/\*+$/, ""),
      plans_done: null,
      plans_total: null,
      status: done ? "complete" : "not-started",
    });
  }
  return phases;
}

function normalizeStatus(raw) {
  const s = raw.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  if (s.includes("complete") || s.includes("done")) return "complete";
  if (s.includes("progress")) return "in-progress";
  if (s.includes("verify") || s.includes("awaiting")) return "awaiting-verify";
  if (s.includes("not start") || s === "-" || s === "") return "not-started";
  return s || "not-started";
}

// ─── REQUIREMENTS.md ─────────────────────────────────────────────────────────

/**
 * Counts checked vs total requirement lines in REQUIREMENTS.md.
 */
function readRequirements(root) {
  const raw = readFile(planningPath(root, "REQUIREMENTS.md"));
  if (!raw) return null;

  let total = 0;
  let checked = 0;

  // Match requirement lines: "- [x] **REQ-ID**:" or "- [ ] **REQ-ID**:"
  const reqRe = /^[-*]\s+\[([ xX])\]\s+\*{0,2}[A-Z][\w-]+-\d+/gm;
  let m;
  while ((m = reqRe.exec(raw)) !== null) {
    total++;
    if (m[1].toLowerCase() === "x") checked++;
  }

  const percent = total > 0 ? Math.round((checked / total) * 100) : 0;
  return { total, checked, percent };
}

// ─── PROJECT.md ───────────────────────────────────────────────────────────────

/**
 * Reads version and liveUrl from a project's .planning/PROJECT.md.
 * Scans only the first 30 lines to avoid false positives.
 * Returns { version: string|null, liveUrl: string|null }.
 */
function readProjectMeta(root) {
  const raw = readFile(planningPath(root, "PROJECT.md"));
  if (!raw) return { version: null, liveUrl: null };

  const lines = raw.split("\n").slice(0, 30).join("\n");

  // Version: try explicit "Version: vX.Y" first, then bare "**vX.Y"
  let version = null;
  const versionMatch1 = lines.match(/\*\*[Vv]ersion:\s*(v[\d.]+)/);
  if (versionMatch1) {
    version = versionMatch1[1];
  } else {
    const versionMatch2 = lines.match(/\*\*(v[\d.]+)\b/);
    if (versionMatch2) version = versionMatch2[1];
  }

  // Live URL: first https:// URL in the scanned lines
  let liveUrl = null;
  const urlMatch = lines.match(/https?:\/\/[^\s)>]+/);
  if (urlMatch) liveUrl = urlMatch[0];

  return { version, liveUrl };
}

// ─── SUMMARY.md stats ─────────────────────────────────────────────────────────

function readSummaryDates(root) {
  const phasesDir = planningPath(root, 'phases');
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dates = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const phaseDir = path.join(phasesDir, entry.name);
      let files;
      try { files = fs.readdirSync(phaseDir); } catch { continue; }
      for (const file of files) {
        if (!file.endsWith('-SUMMARY.md')) continue;
        const filePath = path.join(phaseDir, file);
        const raw = readFile(filePath);
        if (!raw) continue;
        const date = extractSummaryDate(raw, filePath);
        if (date) dates.push(date);
      }
    }
    return dates;
  } catch {
    return [];
  }
}

function extractSummaryDate(raw, filePath) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    let m = fm.match(/^completed:\s*["']?(\d{4}-\d{2}-\d{2})["']?/m);
    if (m) return new Date(m[1]);
    m = fm.match(/completed_date:\s*["']?(\d{4}-\d{2}-\d{2})["']?/m);
    if (m) return new Date(m[1]);
  }
  try { return new Date(fs.statSync(filePath).mtime); } catch { return null; }
}

function computeVelocity(dates) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return dates.filter((d) => d >= sevenDaysAgo).length;
}

function computeStreak(dates) {
  if (dates.length === 0) return 0;
  const daySet = new Set(dates.map((d) => d.toISOString().slice(0, 10)));
  let streak = 0;
  const now = Date.now();
  for (let i = 0; i <= 365; i++) {
    const day = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (daySet.has(day)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}

function computeEstimatedCompletion(dates, phases) {
  if (dates.length < 2) return null;
  let remainingPlans = 0;
  for (const phase of phases) {
    if (
      phase.status !== 'complete' &&
      phase.plans_total != null &&
      phase.plans_done != null
    ) {
      remainingPlans += Math.max(0, phase.plans_total - phase.plans_done);
    }
  }
  if (remainingPlans === 0) return null;
  const sorted = [...dates].sort((a, b) => a - b);
  const totalSpanDays = (sorted[sorted.length - 1] - sorted[0]) / (1000 * 60 * 60 * 24);
  const avgDaysPerPlan = totalSpanDays / (sorted.length - 1);
  if (avgDaysPerPlan <= 0) return null;
  return formatDaysEstimate(avgDaysPerPlan * remainingPlans);
}

function formatDaysEstimate(days) {
  if (days < 1) return '< 1 day';
  if (days < 1.5) return '~1 day';
  if (days < 7) return `~${Math.round(days)} days`;
  if (days < 14) return '~1 week';
  if (days < 21) return '~2 weeks';
  if (days < 35) return '~3 weeks';
  return `~${Math.round(days / 30)} month${Math.round(days / 30) === 1 ? '' : 's'}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

function readProject(name, root) {
  const { version, liveUrl } = readProjectMeta(root);
  const state = readState(root);
  const roadmap = readRoadmap(root);
  const summaryDates = readSummaryDates(root);
  return {
    name,
    root,
    version,
    liveUrl,
    state,
    roadmap,
    requirements: readRequirements(root),
    velocity: computeVelocity(summaryDates),
    streak: computeStreak(summaryDates),
    estimatedCompletion: computeEstimatedCompletion(summaryDates, roadmap?.phases ?? []),
  };
}

module.exports = { readProject, readProjectMeta, readState, readRoadmap, readRequirements };
