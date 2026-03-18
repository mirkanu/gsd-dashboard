const express = require("express");
const path = require("path");
const fs = require("fs");
const { readProject } = require("../gsd/readers");

const router = express.Router();

const CONFIG_PATH = path.resolve(__dirname, "../../gsd-projects.json");

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw);
}

// GET /api/gsd/config — return raw project list from config file
router.get("/config", (_req, res) => {
  try {
    res.json(loadConfig());
  } catch (err) {
    res.status(500).json({ error: "Failed to read gsd-projects.json", detail: err.message });
  }
});

// GET /api/gsd/projects — return parsed planning data for all configured projects
router.get("/projects", (_req, res) => {
  try {
    const { projects } = loadConfig();
    const data = projects.map(({ name, root }) => readProject(name, root));
    res.json({ projects: data });
  } catch (err) {
    res.status(500).json({ error: "Failed to read project data", detail: err.message });
  }
});

module.exports = router;
