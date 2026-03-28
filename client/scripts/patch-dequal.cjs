// dequal 2.0.3 exports field references dist/index.mjs but only ships dist/index.js.
// This postinstall script creates the missing .mjs file so Vite can resolve it.
const fs = require("fs");
const path = require("path");

const targets = ["dist/index.mjs", "lite/index.mjs"];

for (const rel of targets) {
  const mjs = path.join(__dirname, "..", "node_modules", "dequal", rel);
  const js = mjs.replace(".mjs", ".js");
  if (!fs.existsSync(mjs) && fs.existsSync(js)) {
    fs.copyFileSync(js, mjs);
    console.log(`patched dequal: created ${rel}`);
  }
}
