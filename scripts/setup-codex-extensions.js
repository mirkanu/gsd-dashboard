const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCES = {
  agents: path.join(ROOT, "codex", "agents"),
  skills: path.join(ROOT, "codex", "skills"),
};
const AGENTS_TARGET = process.env.CODEX_PROJECT_AGENTS_DIR || path.join(ROOT, ".codex", "agents");
const SKILLS_TARGET = process.env.CODEX_PROJECT_SKILLS_DIR || path.join(ROOT, ".agents", "skills");
const TARGETS = {
  agents: AGENTS_TARGET,
  skills: SKILLS_TARGET,
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyTree(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }
  ensureDir(targetDir);

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      fs.cpSync(sourcePath, targetPath, { recursive: true, force: true });
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function main() {
  copyTree(SOURCES.agents, TARGETS.agents);
  copyTree(SOURCES.skills, TARGETS.skills);

  process.stdout.write("Codex agents and skills synced successfully.\n");
  process.stdout.write(`- Agents: ${TARGETS.agents}\n`);
  process.stdout.write(`- Skills: ${TARGETS.skills}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `Failed to sync Codex extensions: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.stderr.write(
    "Optional overrides: CODEX_PROJECT_AGENTS_DIR and CODEX_PROJECT_SKILLS_DIR.\n"
  );
  process.stderr.write(
    "If this path is restricted in your environment, copy files manually (see codex/README.md).\n"
  );
  process.exit(1);
}
