'use strict';

const fs = require('fs');
const path = require('path');

// Files/dirs whose presence marks a folder as a project
const MANIFEST_FILES = ['.git', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'];

// Folders that are never projects regardless of content
const EXCLUDE_NAMES = new Set([
  'node_modules', 'dist', 'build', '.venv', 'venv', '__pycache__',
  'target', '.git', '.svn',
]);

/**
 * Returns true if folderPath looks like a real project (has a manifest or .git).
 * Never throws — returns false on any error.
 */
function isProject(folderPath) {
  try {
    const items = fs.readdirSync(folderPath);
    return MANIFEST_FILES.some((f) => items.includes(f));
  } catch {
    return false;
  }
}

/**
 * Scan dataHomeRoot for subdirectories that:
 *   - Are not dotfiles (name doesn't start with ".")
 *   - Are not in the registeredNames set (already in gsd-projects.json)
 *   - Are not in EXCLUDE_NAMES
 *   - Pass isProject() (have a manifest file)
 *
 * Returns an array of absolute paths.
 * Never throws — returns [] on any error.
 *
 * @param {string} dataHomeRoot - e.g. "/data/home"
 * @param {string[]} registeredNames - project names already in gsd-projects.json
 * @returns {string[]} absolute paths of candidate folders
 */
function detectUnregisteredFolders(dataHomeRoot, registeredNames = []) {
  const registered = new Set(registeredNames);
  const candidates = [];

  let entries;
  try {
    entries = fs.readdirSync(dataHomeRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;

    // Skip dotfiles, registered, excluded
    if (name.startsWith('.') || registered.has(name) || EXCLUDE_NAMES.has(name)) {
      continue;
    }

    const fullPath = path.join(dataHomeRoot, name);
    if (isProject(fullPath)) {
      candidates.push(fullPath);
    }
  }

  return candidates;
}

module.exports = { detectUnregisteredFolders, isProject, MANIFEST_FILES };
