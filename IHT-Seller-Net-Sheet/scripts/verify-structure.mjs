import { existsSync } from "node:fs";
const required = ["index.html", "src/main.tsx", "src/App.tsx"];
const missing = required.filter((path) => !existsSync(path));
if (missing.length) {
  console.error(`Missing required repository files: ${missing.join(", ")}`);
  console.error("Upload the contents of the repository folder, preserving the src directory.");
  process.exit(1);
}
console.log("Repository structure verified.");
