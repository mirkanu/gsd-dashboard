const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");

const GSD_PROJECTS_PATH = path.join(__dirname, "..", "..", "gsd-projects.json");

/**
 * Normalize an Atlassian Statuspage indicator to our 4-value status.
 * indicator: "none" | "minor" | "major" | "critical"
 */
function normalizeAtlassian(indicator) {
  if (indicator === "none") return "operational";
  if (indicator === "minor") return "degraded";
  if (indicator === "major" || indicator === "critical") return "outage";
  return "unknown";
}

/**
 * Normalize a plain status string (Railway instatus format).
 * @param {string} status
 */
function normalizePlain(status) {
  if (typeof status !== "string") return "unknown";
  if (status === "operational") return "operational";
  return "degraded";
}

/**
 * Fetch a single status URL and return a normalized result.
 * Always resolves — never rejects.
 */
async function fetchStatus(name, statusUrl) {
  try {
    const res = await fetch(statusUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) {
      return { name, statusUrl, status: "unknown", description: "HTTP " + res.status };
    }
    const json = await res.json();

    // Atlassian Statuspage format: { status: { indicator, description } }
    if (json.status && typeof json.status === "object" && json.status.indicator !== undefined) {
      return {
        name,
        statusUrl,
        status: normalizeAtlassian(json.status.indicator),
        description: json.status.description || "",
      };
    }

    // Plain string status format (Railway instatus / others)
    if (typeof json.status === "string") {
      return {
        name,
        statusUrl,
        status: normalizePlain(json.status),
        description: json.status,
      };
    }

    return { name, statusUrl, status: "unknown", description: "Unrecognized response format" };
  } catch (err) {
    return { name, statusUrl, status: "unknown", description: err.message || "Fetch error" };
  }
}

/**
 * GET /api/services/status
 * Returns live status for all configured external services grouped by project.
 */
router.get("/status", async (_req, res) => {
  let config;
  try {
    const raw = fs.readFileSync(GSD_PROJECTS_PATH, "utf8");
    config = JSON.parse(raw);
  } catch (err) {
    return res.status(500).json({ error: "Failed to read gsd-projects.json", detail: err.message });
  }

  const projects = (config.projects || []).filter(
    (p) => Array.isArray(p.services) && p.services.length > 0
  );

  // Build a deduplicated map of statusUrl -> fetch promise
  const urlMap = new Map();
  for (const project of projects) {
    for (const svc of project.services) {
      if (!urlMap.has(svc.statusUrl)) {
        urlMap.set(svc.statusUrl, fetchStatus(svc.name, svc.statusUrl));
      }
    }
  }

  // Fetch all unique URLs in parallel
  const entries = Array.from(urlMap.entries());
  const results = await Promise.allSettled(entries.map(([, promise]) => promise));

  // Build result lookup by statusUrl
  const statusByUrl = new Map();
  for (let i = 0; i < entries.length; i++) {
    const [url] = entries[i];
    const result = results[i];
    if (result.status === "fulfilled") {
      statusByUrl.set(url, result.value);
    } else {
      // Rejected should never happen since fetchStatus always resolves, but be safe
      statusByUrl.set(url, { status: "unknown", description: "Unexpected error" });
    }
  }

  // Assemble response grouped by project
  const responseProjects = projects.map((project) => ({
    name: project.name,
    services: project.services.map((svc) => {
      const fetched = statusByUrl.get(svc.statusUrl);
      return {
        name: svc.name,
        status: fetched ? fetched.status : "unknown",
        description: fetched ? fetched.description : "Unknown",
      };
    }),
  }));

  res.json({ projects: responseProjects });
});

module.exports = router;
