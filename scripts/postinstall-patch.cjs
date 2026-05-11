#!/usr/bin/env node
/**
 * Postinstall patch: fixes tree-sitter-arkts binding to attach nodeTypeInfo
 * directly to the language object so tree-sitter's initializeLanguageNodeClasses
 * can find it. Required for tree-sitter 0.21 compatibility.
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const patchFile = path.join(__dirname, "..", "patches", "tree-sitter-arkts+0.0.1-beta.0.patch");
const targetDir = path.join(__dirname, "..", "node_modules", "tree-sitter-arkts");

if (!fs.existsSync(targetDir)) {
  console.log("[postinstall] tree-sitter-arkts not installed, skipping patch");
  process.exit(0);
}

// Check if already patched
const bindingFile = path.join(targetDir, "bindings", "node", "index.js");
const content = fs.readFileSync(bindingFile, "utf8");
if (content.includes("language.nodeTypeInfo")) {
  console.log("[postinstall] tree-sitter-arkts already patched, skipping");
  process.exit(0);
}

// Apply patch
try {
  execSync(`git apply "${patchFile}" --directory=node_modules/tree-sitter-arkts`, {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  });
  console.log("[postinstall] tree-sitter-arkts patched successfully");
} catch (e) {
  console.error("[postinstall] failed to patch tree-sitter-arkts:", e.message);
  process.exit(1);
}
