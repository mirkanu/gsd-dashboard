const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const CONFIG_PATH = path.resolve(__dirname, "../../gsd-projects.json");

router.get("/config", (_req, res) => {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const config = JSON.parse(raw);
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: "Failed to read gsd-projects.json", detail: err.message });
  }
});

module.exports = router;
