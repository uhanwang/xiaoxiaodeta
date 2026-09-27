import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  deleteSlot,
  estimateAnchors,
  listSlots,
  listWardrobeVariants,
  readAnchors,
  saveActivePetToSlot,
  switchToSlot,
  WARDROBE_OUTFITS,
  wardrobeVariantPath,
} = require("../electron/wardrobe.cjs");
const { resolveClientAsset } = require("../electron/customAssets.cjs");
const { applyProgressEvent, migrateSave } = await import("../src/progression.js");

const CELL_W = 192;
const CELL_H = 208;
const ATLAS_W = CELL_W * 8;
const ATLAS_H = CELL_H * 11;

function withTempDirectory(run) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "desktop-pet-wardrobe-"));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function syntheticAtlasRgba() {
  const rgba = new Uint8ClampedArray(ATLAS_W * ATLAS_H * 4);
  // A simple "figure" in the idle cell (row 0, col 0): a 41x149 body block
  // centred on the cell, like a standing character.
  const left = 76;
  const right = 116;
  const top = 42;
  const bottom = 190;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const offset = (y * ATLAS_W + x) * 4;
      rgba[offset] = 200;
      rgba[offset + 1] = 120;
      rgba[offset + 2] = 130;
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

test("estimateAnchors derives head/neck/prop points and scale from the idle cell", () => {
  const anchors = estimateAnchors(syntheticAtlasRgba(), ATLAS_W, ATLAS_H);
  assert.ok(anchors, "anchors should be estimated from a drawn figure");
  // Figure bbox: x 76-116, y 42-190 → centre 96, height 149.
  assert.equal(anchors.head.x, (96 / CELL_W) * 100);
  assert.ok(Math.abs(anchors.head.y - ((42 + 149 * 0.13) / CELL_H) * 100) < 0.5);
  assert.ok(Math.abs(anchors.neck.y - ((42 + 149 * 0.32) / CELL_H) * 100) < 0.5);
  assert.ok(Math.abs(anchors.prop.x - ((96 + 41 * 0.3) / CELL_W) * 100) < 0.5);
  assert.ok(Math.abs(anchors.prop.y - ((42 + 149 * 0.52) / CELL_H) * 100) < 0.5);
  assert.ok(Math.abs(anchors.scale - 149 / (CELL_H * 0.72)) < 0.01);
  // Scale is clamped so extremely large/small figures stay wearable.
  assert.ok(anchors.scale >= 0.55 && anchors.scale <= 1.35);
});

test("estimateAnchors returns null for an empty atlas", () => {
  assert.equal(estimateAnchors(new Uint8ClampedArray(ATLAS_W * ATLAS_H * 4), ATLAS_W, ATLAS_H), null);
});

test("wardrobe variant paths are restricted to the eight known outfits", () => {
  withTempDirectory((directory) => {
    const userData = path.join(directory, "profile");
    for (const outfit of WARDROBE_OUTFITS) {
      assert.ok(wardrobeVariantPath(userData, outfit).endsWith(`custom-pet\\wardrobe\\${outfit}.png`));
    }
    assert.equal(wardrobeVariantPath(userData, "../escape"), null);
    assert.equal(wardrobeVariantPath(userData, "unknown"), null);
    assert.equal(wardrobeVariantPath(userData, ""), null);
  });
});

test("closet save/switch/delete round-trips atlas, anchors and wardrobe variants", () => {
  withTempDirectory((directory) => {
    const userData = path.join(directory, "profile");
    const atlas = path.join(userData, "custom-pet", "pet-actions-installed.png");
    const anchors = path.join(userData, "custom-pet", "anchors.json");
    const variant = wardrobeVariantPath(userData, "rose");
    mkdirSync(path.dirname(atlas), { recursive: true });
    writeFileSync(atlas, "atlas-v1");
    writeFileSync(anchors, JSON.stringify({ head: { x: 50, y: 16 }, neck: { x: 50, y: 41 }, prop: { x: 60, y: 55 }, scale: 1 }));
    mkdirSync(path.dirname(variant), { recursive: true });
    writeFileSync(variant, "rose-variant");

    const slot = saveActivePetToSlot(userData, { name: "测试形象" });
    assert.match(slot.id, /^slot-[a-z0-9-]+$/);
    assert.equal(slot.name, "测试形象");
    assert.equal(listSlots(userData).length, 1);

    // Mutate the active look, then switch back: everything must be restored.
    writeFileSync(atlas, "atlas-v2");
    writeFileSync(anchors, JSON.stringify({ head: { x: 1, y: 1 }, neck: { x: 1, y: 1 }, prop: { x: 1, y: 1 }, scale: 1 }));
    rmSync(variant);
    assert.equal(listWardrobeVariants(userData).size, 0);

    switchToSlot(userData, slot.id);
    assert.equal(readFileSync(atlas, "utf8"), "atlas-v1");
    assert.equal(readAnchors(userData).head.x, 50);
    assert.deepEqual([...listWardrobeVariants(userData)], ["rose"]);

    deleteSlot(userData, slot.id);
    assert.equal(listSlots(userData).length, 0);
  });
});

test("closet rejects malformed slot ids and missing slots", () => {
  withTempDirectory((directory) => {
    const userData = path.join(directory, "profile");
    assert.throws(() => switchToSlot(userData, "../escape"), /不存在|损坏/);
    assert.throws(() => switchToSlot(userData, "missing-slot"), /不存在|损坏/);
    assert.throws(() => saveActivePetToSlot(userData, {}), /还没有可以保存的形象/);
    // Deleting something already gone is a no-op, not an error.
    deleteSlot(userData, "slot-never-existed");
  });
});

test("wardrobe routes serve generated variants, fall back to the base atlas, never to bundled art", () => {
  withTempDirectory((directory) => {
    const clientRoot = path.join(directory, "dist");
    const bundled = path.join(clientRoot, "assets", "wardrobe", "rose", "atlas", "pet-actions-installed.webp");
    mkdirSync(path.dirname(bundled), { recursive: true });
    writeFileSync(bundled, "bundled-rose");
    const userData = path.join(directory, "profile");

    const route = "assets/wardrobe/rose/atlas/pet-actions-installed.webp";
    // Default mode: bundled tinted atlas, unchanged legacy behaviour.
    assert.equal(resolveClientAsset(route, clientRoot, userData), bundled);
    // Legacy per-sprite wardrobe art also resolves to bundled files here.
    const spriteRoute = "assets/wardrobe/rose/sprites/idle.png";
    assert.equal(resolveClientAsset(spriteRoute, clientRoot, userData), path.join(clientRoot, "assets", "wardrobe", "rose", "sprites", "idle.png"));

    // Custom-atlas mode: marker + installed base atlas.
    mkdirSync(path.join(userData, "custom-pet"), { recursive: true });
    const base = path.join(userData, "custom-pet", "pet-actions-installed.png");
    writeFileSync(base, "custom-base");
    writeFileSync(path.join(userData, "custom-pet", "active-mode.json"), JSON.stringify({ mode: "atlas" }));

    // Missing variant falls back to the user's own base atlas.
    assert.equal(resolveClientAsset(route, clientRoot, userData), base);
    // A generated variant wins over the base.
    const variant = wardrobeVariantPath(userData, "rose");
    mkdirSync(path.dirname(variant), { recursive: true });
    writeFileSync(variant, "custom-rose");
    assert.equal(resolveClientAsset(route, clientRoot, userData), variant);
    // Unknown outfit: still falls back to base (never bundled).
    assert.equal(resolveClientAsset("assets/wardrobe/unknown/atlas/pet-actions-installed.webp", clientRoot, userData), base);
    // Per-sprite wardrobe art never applies to a custom character.
    assert.equal(resolveClientAsset(spriteRoute, clientRoot, userData), null);
    // Without a variant AND without the base atlas there is nothing safe to
    // serve for that outfit — the bundled character must not leak through.
    rmSync(base);
    assert.equal(resolveClientAsset("assets/wardrobe/sky/atlas/pet-actions-installed.webp", clientRoot, userData), null);
  });
});

test("closet thumbnails resolve through the protocol route", () => {
  withTempDirectory((directory) => {
    const userData = path.join(directory, "profile");
    mkdirSync(path.join(userData, "custom-pet"), { recursive: true });
    writeFileSync(path.join(userData, "custom-pet", "pet-actions-installed.png"), "atlas");
    const slot = saveActivePetToSlot(userData, {});
    const thumbnail = resolveClientAsset(`assets/custom/closet/${slot.id}.png`, path.join(directory, "dist"), userData);
    assert.ok(thumbnail && thumbnail.endsWith(`saved\\${slot.id}\\atlas.png`));
    assert.equal(resolveClientAsset("assets/custom/closet/missing.png", path.join(directory, "dist"), userData), null);
    // A path that escapes the client root after normalisation is rejected.
    assert.equal(resolveClientAsset("assets/custom/closet/../../../../escape.png", path.join(directory, "dist"), userData), null);
  });
});

test("guide config ships all eight outfit themes with prompts metadata", () => {
  const guide = JSON.parse(readFileSync(new URL("../shared/qpet-strips.json", import.meta.url), "utf8"));
  assert.deepEqual(guide.outfits.map((entry) => entry.outfit), [...WARDROBE_OUTFITS]);
  for (const entry of guide.outfits) {
    assert.ok(entry.label.length >= 2, `${entry.outfit} needs a label`);
    assert.ok(entry.description.length >= 6, `${entry.outfit} needs a description`);
  }
  assert.equal(guide.strips.length, 7);
});

test("grantCosmetic unlocks an outfit for free and equip then applies it", () => {
  const now = new Date();
  const save = migrateSave(null, null, now);
  const itemId = "outfit-rose";
  const item = { id: itemId };
  assert.ok(item, "fixture");
  // Not owned yet: a plain equip is a no-op.
  const rejected = applyProgressEvent(save, { type: "equip", itemId }, now);
  assert.equal(rejected.applied, false);
  // Grant, then equip.
  const granted = applyProgressEvent(save, { type: "grantCosmetic", itemId }, now);
  assert.ok(granted.applied);
  assert.ok(granted.save.progression.collection.includes(itemId));
  // Duplicate grant does not duplicate the entry.
  const grantedTwice = applyProgressEvent(granted.save, { type: "grantCosmetic", itemId }, now);
  assert.equal(grantedTwice.save.progression.collection.filter((id) => id === itemId).length, 1);
  const equipped = applyProgressEvent(granted.save, { type: "equip", itemId }, now);
  assert.ok(equipped.applied);
  assert.equal(equipped.save.progression.equipped.outfit, "rose");
  // Unknown items are rejected.
  const unknown = applyProgressEvent(save, { type: "grantCosmetic", itemId: "outfit-nope" }, now);
  assert.equal(unknown.applied, false);
});
