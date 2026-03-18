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

// ─── Public API ───────────────────────────────────────────────────────────────

function readProject(name, root) {
  return {
    name,
    root,
    state: readState(root),
    roadmap: readRoadmap(root),
    requirements: readRequirements(root),
  };
}

module.exports = { readProject, readState, readRoadmap, readRequirements };
