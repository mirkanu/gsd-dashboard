const { Router } = require("express");
const { execSync } = require("child_process");

const router = Router();

router.post("/restart-librechat", (req, res) => {
  const secret = process.env.LIBRECHAT_RESTART_SECRET;
  if (!secret || req.headers["x-restart-secret"] !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    execSync("docker restart librechat", { timeout: 30000 });
    res.json({ success: true, message: "librechat restarted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
