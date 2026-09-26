const { spawnSync } = require("node:child_process");
const path = require("node:path");

const project = path.resolve(__dirname, "..");
const python = path.join(project, ".venv", "Scripts", "python.exe");
const runner = path.join(project, "scripts", "qa-action-atlas.py");
const sheetRunner = path.join(project, "scripts", "qa-action-sheets.py");
const atlas = path.join(project, "public", "assets", "atlas", "pet-actions-installed.webp");
for (const [script, args] of [[runner, ["--project", project, "--atlas", atlas]], [sheetRunner, ["--project", project]]]) {
  const result = spawnSync(python, [script, ...args], { stdio: "inherit" });
  if (result.error) {
    process.stderr.write(`Atlas QA could not start Python: ${result.error.message}\n`);
    process.exitCode = 1;
    break;
  }
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}
