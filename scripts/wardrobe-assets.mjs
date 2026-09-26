import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = path.join(root, ".venv", "Scripts", "python.exe");
const task = process.argv[2] === "build" ? "build-wardrobe-assets.py" : "test-wardrobe-assets.py";
const result = spawnSync(python, [path.join(root, "scripts", task)], { cwd: root, stdio: "inherit" });
if (result.error) {
  process.stderr.write("Could not start the project Python runtime: " + result.error.message + "\n");
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
