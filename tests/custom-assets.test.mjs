import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  customAtlasPath,
  installCustomAtlas,
  parseCustomAssetCommand,
  resetCustomAtlas,
  resolveClientAsset,
} = require("../electron/customAssets.cjs");

function withTempDirectory(run) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "desktop-pet-custom-assets-"));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("custom atlas overrides only the registered bundled atlas route", () => {
  withTempDirectory((directory) => {
    const bundled = path.join(directory, "dist", "assets", "atlas", "pet-actions-installed.webp");
    const userData = path.join(directory, "profile");
    mkdirSync(path.dirname(bundled), { recursive: true });
    writeFileSync(bundled, "bundled");
    assert.equal(resolveClientAsset("assets/atlas/pet-actions-installed.webp", path.join(directory, "dist"), userData), bundled);

    const override = customAtlasPath(userData);
    mkdirSync(path.dirname(override), { recursive: true });
    writeFileSync(override, "custom");
    assert.equal(resolveClientAsset("assets/atlas/pet-actions-installed.webp", path.join(directory, "dist"), userData), override);
    assert.equal(resolveClientAsset("assets/sprites/idle.png", path.join(directory, "dist"), userData), path.join(directory, "dist", "assets", "sprites", "idle.png"));
  });
});

test("asset resolution rejects traversal outside the packaged client", () => {
  withTempDirectory((directory) => {
    assert.equal(resolveClientAsset("../../outside.txt", path.join(directory, "dist"), path.join(directory, "profile")), null);
    assert.equal(resolveClientAsset("%2e%2e/private", path.join(directory, "dist"), path.join(directory, "profile")), null);
    assert.equal(resolveClientAsset("%E0%A4%A", path.join(directory, "dist"), path.join(directory, "profile")), null);
  });
});

test("custom atlas import validates image type and dimensions before atomic install", () => {
  withTempDirectory((directory) => {
    const source = path.join(directory, "candidate.png");
    const userData = path.join(directory, "profile");
    writeFileSync(source, "candidate");
    const nativeImage = {
      createFromPath: () => ({
        isEmpty: () => false,
        getSize: () => ({ width: 1536, height: 2288 }),
        toPNG: () => Buffer.from("validated-png"),
      }),
    };
    const destination = installCustomAtlas(source, userData, nativeImage);
    assert.equal(destination, customAtlasPath(userData));
    assert.equal(require("node:fs").readFileSync(destination, "utf8"), "validated-png");

    const wrongSize = { createFromPath: () => ({ isEmpty: () => false, getSize: () => ({ width: 32, height: 32 }) }) };
    assert.throws(() => installCustomAtlas(source, userData, wrongSize), /must be 1536x2288/);
    assert.equal(require("node:fs").readFileSync(destination, "utf8"), "validated-png");
  });
});

test("custom atlas command parsing supports install, reset, and missing paths", () => {
  assert.deepEqual(parseCustomAssetCommand(["main.cjs", "--install-custom-atlas", "C:\\tmp\\atlas.png", "--custom-asset-status", "C:\\tmp\\status.json"]), {
    type: "install",
    sourcePath: "C:\\tmp\\atlas.png",
    statusPath: "C:\\tmp\\status.json",
  });
  assert.deepEqual(parseCustomAssetCommand(["main.cjs", "--reset-custom-atlas"]), { type: "reset", statusPath: null });
  assert.equal(parseCustomAssetCommand(["main.cjs", "--capture"]), null);
  assert.throws(() => parseCustomAssetCommand(["main.cjs", "--install-custom-atlas"]), /requires an image path/);
});

test("reset removes only the custom atlas and preserves other user data", () => {
  withTempDirectory((directory) => {
    const userData = path.join(directory, "profile");
    const override = customAtlasPath(userData);
    mkdirSync(path.dirname(override), { recursive: true });
    writeFileSync(override, "custom");
    writeFileSync(path.join(userData, "pet-save-v1.json"), "save");
    resetCustomAtlas(userData);
    assert.equal(require("node:fs").existsSync(override), false);
    assert.equal(require("node:fs").readFileSync(path.join(userData, "pet-save-v1.json"), "utf8"), "save");
  });
});
