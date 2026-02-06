#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || args.has("-n");

const entries = fs.readdirSync(root, { withFileTypes: true });
const targets = entries
  .filter((entry) => entry.isFile() && entry.name.startsWith("-"))
  .map((entry) => entry.name);

if (targets.length === 0) {
  console.log("No weird files found.");
  process.exit(0);
}

targets.forEach((name) => {
  const filePath = path.join(root, name);
  if (dryRun) {
    console.log(`[dry-run] Would remove ${name}`);
    return;
  }
  fs.unlinkSync(filePath);
  console.log(`Removed ${name}`);
});
