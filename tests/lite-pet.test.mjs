import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  LITE_ROLES,
  installLitePet,
  liteAssetPath,
  liteManifestPath,
  manifestFor,
  readActiveMode,
  resetLitePet,
  validateLitePlan,
  writeActiveMode,
} = require("../electron/litePet.cjs");

test("validateLitePlan requires an idle photo and known roles", () => {
  assert.equal(validateLitePlan([]).ok, false);
  assert.equal(validateLitePlan([{ role: "wave", sourcePath: "a.png" }]).ok, false);
  assert.equal(
    validateLitePlan([{ role: "banana", sourcePath: "a.png" }, { role: "idle", sourcePath: "b.png" }]).ok,
    false,
  );
  assert.equal(
    validateLitePlan([{ role: "idle", sourcePath: "a.gif" }]).ok,
    false,
  );
  const ok = validateLitePlan([
    { role: "idle", sourcePath: "C:\\photos\\me.png" },
    { role: "wave", sourcePath: "C:\\photos\\wave.JPG" },
  ]);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.roles, ["idle", "wave"]);
  assert.ok(LITE_ROLES.includes("idle"));
});

test("manifestFor maps roles to per-role png filenames", () => {
  const manifest = manifestFor([{ role: "idle", sourcePath: "x.png" }, { role: "fail", sourcePath: "y.jpg" }]);
  assert.equal(manifest.type, "lite");
  assert.deepEqual(manifest.images, { idle: "idle.png", fail: "fail.png" });
});

function withTempUserData(run) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "lite-pet-test-"));
  try {
    return run(userData);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

test("liteAssetPath only serves role pngs that exist", () => {
  withTempUserData((userData) => {
    fs.mkdirSync(path.join(userData, "custom-pet", "lite"), { recursive: true });
    fs.writeFileSync(path.join(userData, "custom-pet", "lite", "idle.png"), "png");
    assert.ok(liteAssetPath(userData, "idle.png"));
    assert.equal(liteAssetPath(userData, "..\\secret.png"), null);
    assert.equal(liteAssetPath(userData, "missing.png"), null);
    assert.equal(liteAssetPath(userData, "manifest.json"), null);
  });
});

test("active mode marker round-trips and rejects unknown modes", () => {
  withTempUserData((userData) => {
    assert.equal(readActiveMode(userData), null);
    writeActiveMode(userData, "lite");
    assert.equal(readActiveMode(userData), "lite");
    fs.writeFileSync(path.join(userData, "custom-pet", "active-mode.json"), JSON.stringify({ mode: "banana" }));
    assert.equal(readActiveMode(userData), null);
  });
});

test("installLitePet rejects invalid plans before touching the disk", () => {
  withTempUserData((userData) => {
    const deps = { nativeImage: {}, ort: {}, modelPath: "unused" };
    assert.rejects(
      () => installLitePet([{ role: "idle", sourcePath: "missing.png" }], userData, deps).catch((error) => {
        throw error;
      }),
      /找不到这张照片/,
    );
    assert.equal(fs.existsSync(liteManifestPath(userData)), false);
  });
});
