// Pure helpers for custom-atlas wardrobe support: anchor estimation from the
// idle cell (for accessory overlays) and slot-directory layout for the pet
// closet. No recoloring — outfit variants are assembled from user-generated
// strips through the same pipeline as the main atlas.
const fs = require("node:fs");
const path = require("node:path");

const { alphaBoundingBox } = require("./imageOps.cjs");

const CELL_W = 192;
const CELL_H = 208;
const WARDROBE_OUTFITS = Object.freeze([
  "rose", "sky", "moon", "strawberry", "winter", "sailor", "wizard", "sunset",
]);

// Estimates accessory anchors from the idle cell's figure bounding box.
// Returns fractions of the cell (0-100 for the SVG viewBox) plus a scale
// factor relative to the default character's figure height (~72% of cell).
function estimateAnchors(atlasRgba, atlasWidth, atlasHeight) {
  const cell = extractCell(atlasRgba, atlasWidth, atlasHeight, 0, 0);
  const box = alphaBoundingBox(cell, CELL_W, CELL_H, 8);
  if (!box) return null;
  const figWidth = box.right - box.left + 1;
  const figHeight = box.bottom - box.top + 1;
  const centerX = (box.left + box.right) / 2;
  return {
    head: { x: round2((centerX / CELL_W) * 100), y: round2(((box.top + figHeight * 0.13) / CELL_H) * 100) },
    neck: { x: round2((centerX / CELL_W) * 100), y: round2(((box.top + figHeight * 0.32) / CELL_H) * 100) },
    prop: { x: round2(((centerX + figWidth * 0.3) / CELL_W) * 100), y: round2(((box.top + figHeight * 0.52) / CELL_H) * 100) },
    scale: round2(Math.min(1.35, Math.max(0.55, figHeight / (CELL_H * 0.72)))),
  };
}

function extractCell(atlasRgba, atlasWidth, atlasHeight, row, column) {
  const cell = new Uint8ClampedArray(CELL_W * CELL_H * 4);
  const cellStride = atlasWidth * 4;
  for (let y = 0; y < CELL_H; y += 1) {
    const sourceY = row * CELL_H + y;
    if (sourceY >= atlasHeight) break;
    const sourceStart = sourceY * cellStride + column * CELL_W * 4;
    cell.set(atlasRgba.subarray(sourceStart, sourceStart + CELL_W * 4), y * CELL_W * 4);
  }
  return cell;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function anchorsPath(userDataPath) {
  return path.join(userDataPath, "custom-pet", "anchors.json");
}

function readAnchors(userDataPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(anchorsPath(userDataPath), "utf8"));
    return parsed && parsed.head && parsed.neck && parsed.prop ? parsed : null;
  } catch {
    return null;
  }
}

function writeAnchors(userDataPath, anchors) {
  fs.mkdirSync(path.dirname(anchorsPath(userDataPath)), { recursive: true });
  fs.writeFileSync(anchorsPath(userDataPath), JSON.stringify(anchors, null, 2), "utf8");
}

// Wardrobe variant storage: custom-pet/wardrobe/<outfit>.png
function wardrobeVariantPath(userDataPath, outfit) {
  if (!WARDROBE_OUTFITS.includes(outfit)) return null;
  return path.join(userDataPath, "custom-pet", "wardrobe", `${outfit}.png`);
}

function listWardrobeVariants(userDataPath) {
  const available = new Set();
  for (const outfit of WARDROBE_OUTFITS) {
    const variantPath = wardrobeVariantPath(userDataPath, outfit);
    if (variantPath && fs.existsSync(variantPath)) available.add(outfit);
  }
  return available;
}

// Pet closet slots: custom-pet/saved/<slotId>/{atlas.png, wardrobe/, anchors.json, meta.json}
function slotsDir(userDataPath) {
  return path.join(userDataPath, "custom-pet", "saved");
}

function activeAtlasFile(userDataPath) {
  return path.join(userDataPath, "custom-pet", "pet-actions-installed.png");
}

function defaultSlotName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `形象 ${pad(now.getMonth() + 1)}${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// Copies the currently active look (atlas + anchors + wardrobe variants) into
// a new closet slot. The closet keeps every generated pet so the user can
// switch between them without regenerating.
function saveActivePetToSlot(userDataPath, { name } = {}) {
  const atlas = activeAtlasFile(userDataPath);
  if (!fs.existsSync(atlas)) throw new Error("还没有可以保存的形象。");
  const slotId = `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const slot = slotDir(userDataPath, slotId);
  if (!slot) throw new Error("形象槽位 id 不合法。");
  fs.mkdirSync(path.join(slot, "wardrobe"), { recursive: true });
  fs.copyFileSync(atlas, path.join(slot, "atlas.png"));
  const anchors = anchorsPath(userDataPath);
  if (fs.existsSync(anchors)) fs.copyFileSync(anchors, path.join(slot, "anchors.json"));
  const wardrobeDir = path.join(userDataPath, "custom-pet", "wardrobe");
  if (fs.existsSync(wardrobeDir)) {
    for (const file of fs.readdirSync(wardrobeDir)) {
      if (file.toLowerCase().endsWith(".png")) {
        fs.copyFileSync(path.join(wardrobeDir, file), path.join(slot, "wardrobe", file));
      }
    }
  }
  const meta = { name: String(name || "").trim().slice(0, 24) || defaultSlotName(), createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(slot, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  return { id: slotId, ...meta };
}

// Brings a slot back as the active look: atlas, anchors and wardrobe variants
// all travel with the slot, so switching is instant and lossless.
function switchToSlot(userDataPath, slotId) {
  const slot = slotDir(userDataPath, slotId);
  const atlas = slot ? path.join(slot, "atlas.png") : null;
  if (!atlas || !fs.existsSync(atlas)) throw new Error("这个形象槽位不存在或已损坏。");
  fs.copyFileSync(atlas, activeAtlasFile(userDataPath));
  const slotAnchors = path.join(slot, "anchors.json");
  const activeAnchors = anchorsPath(userDataPath);
  if (fs.existsSync(slotAnchors)) fs.copyFileSync(slotAnchors, activeAnchors);
  else fs.rmSync(activeAnchors, { force: true });
  const activeWardrobe = path.join(userDataPath, "custom-pet", "wardrobe");
  fs.rmSync(activeWardrobe, { recursive: true, force: true });
  const slotWardrobe = path.join(slot, "wardrobe");
  if (fs.existsSync(slotWardrobe)) fs.cpSync(slotWardrobe, activeWardrobe, { recursive: true });
  return listSlots(userDataPath).find((entry) => entry.id === slotId) || { id: slotId };
}

function deleteSlot(userDataPath, slotId) {
  const slot = slotDir(userDataPath, slotId);
  if (!slot) throw new Error("形象槽位不存在。");
  if (!fs.existsSync(slot)) return { id: slotId };
  fs.rmSync(slot, { recursive: true, force: true });
  return { id: slotId };
}

function slotDir(userDataPath, slotId) {
  if (!/^[a-z0-9-]{1,40}$/.test(String(slotId || ""))) return null;
  return path.join(slotsDir(userDataPath), slotId);
}

function listSlots(userDataPath) {
  const directory = slotsDir(userDataPath);
  if (!fs.existsSync(directory)) return [];
  const slots = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const slotPath = path.join(directory, entry.name);
    const atlasPath = path.join(slotPath, "atlas.png");
    if (!fs.existsSync(atlasPath)) continue;
    let meta = { name: entry.name, createdAt: null };
    try {
      meta = { ...meta, ...JSON.parse(fs.readFileSync(path.join(slotPath, "meta.json"), "utf8")) };
    } catch {
      // Keep the slot listed even with a damaged meta file.
    }
    slots.push({ id: entry.name, name: meta.name, createdAt: meta.createdAt || null });
  }
  slots.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  return slots;
}

module.exports = {
  WARDROBE_OUTFITS,
  activeAtlasFile,
  anchorsPath,
  deleteSlot,
  estimateAnchors,
  listSlots,
  listWardrobeVariants,
  readAnchors,
  saveActivePetToSlot,
  slotDir,
  slotsDir,
  switchToSlot,
  wardrobeVariantPath,
  writeAnchors,
};
