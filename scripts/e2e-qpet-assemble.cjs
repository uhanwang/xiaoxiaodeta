// Headless end-to-end check for the guide-based assembly flow, under Electron:
//   npx electron scripts/e2e-qpet-assemble.cjs
// Draws synthetic action strips (cyan background, uniform baseline figures),
// then runs the same composition pipeline as assembleQPet and installs the
// result into a temp userData, asserting QA passes and the atlas lands.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, nativeImage } = require("electron");

const { atlasQA, composeAtlas, cyanKeyAlpha, mirrorRgba, registerRowFrames, splitStripFrames } = require("../electron/atlasCompose.cjs");
const { installCustomAtlas, resolveAppearanceMode } = require("../electron/customAssets.cjs");
const { writeActiveMode } = require("../electron/litePet.cjs");
const GUIDE = require("../shared/qpet-strips.json");

function drawStrip(frames, width, height) {
  const bgra = Buffer.alloc(width * height * 4);
  const figureWidth = 60;
  const footY = height - 20;
  for (let index = 0; index < frames; index += 1) {
    const centerX = Math.round((index + 0.5) * (width / frames));
    const bodyHeight = height - 120;
    for (let y = footY - bodyHeight; y < footY; y += 1) {
      for (let x = centerX - figureWidth / 2; x < centerX + figureWidth / 2; x += 1) {
        const offset = (y * width + x) * 4;
        bgra[offset] = 40; bgra[offset + 1] = 30; bgra[offset + 2] = 200; bgra[offset + 3] = 255;
      }
    }
  }
  return nativeImage.createFromBitmap(bgra, { width, height });
}

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "qpet-assemble-e2e-"));
  app.setPath("userData", userData);
  const ort = require("onnxruntime-node");
  void ort;

  const stripCells = {};
  for (const spec of GUIDE.strips) {
    const strip = drawStrip(spec.frames, 256 * spec.frames, 400);
    const rgba = stripToRgba(strip);
    const frames = splitStripFrames(rgba, spec.frames);
    const keyed = frames.map((frame) => ({ data: cyanKeyAlpha(frame.data), width: frame.width, height: frame.height }));
    stripCells[spec.name] = registerRowFrames(keyed);
  }

  const padTo = (cells, target, filler) => {
    const result = [...cells];
    while (result.length < target) result.push(filler);
    return result.slice(0, target);
  };
  const idle = padTo(stripCells.idle, 7, stripCells.idle[0]);
  const runRight = padTo(stripCells.running, 8, stripCells.running[0]);
  const runLeft = runRight.map((cell) => mirrorRgba(cell, 192, 208));
  const gaze = new Array(8).fill(stripCells.idle[0]);
  const atlas = composeAtlas({
    0: idle,
    1: runRight,
    2: runLeft,
    3: stripCells.waving,
    4: stripCells.jumping,
    5: stripCells.failed,
    6: stripCells.waiting,
    7: stripCells.running,
    8: stripCells.review,
    9: gaze,
    10: gaze,
  });

  const qa = atlasQA(atlas);
  if (!qa.ok) {
    console.error("E2E_FAIL: QA errors:", qa.errors.slice(0, 6));
    app.exit(1);
    return;
  }

  const candidatePath = path.join(userData, "atlas.png");
  const width = 192 * 8;
  const height = 208 * 11;
  const bgra = Buffer.alloc(atlas.length);
  for (let index = 0; index < atlas.length; index += 4) {
    bgra[index] = atlas[index + 2];
    bgra[index + 1] = atlas[index + 1];
    bgra[index + 2] = atlas[index];
    bgra[index + 3] = atlas[index + 3];
  }
  fs.writeFileSync(candidatePath, nativeImage.createFromBitmap(bgra, { width, height }).toPNG());

  installCustomAtlas(candidatePath, userData, nativeImage);
  writeActiveMode(userData, "atlas");
  const mode = resolveAppearanceMode(userData);
  const installed = nativeImage.createFromPath(path.join(userData, "custom-pet", "pet-actions-installed.png"));
  const summary = { mode, size: installed.getSize(), nonEmpty: !installed.isEmpty() };
  console.log(JSON.stringify(summary));
  if (mode !== "atlas" || installed.isEmpty() || summary.size.width !== 1536 || summary.size.height !== 2288) {
    console.error("E2E_FAIL: atlas not installed correctly");
    app.exit(1);
    return;
  }
  console.log("E2E_OK: guide assembly produced a valid installed atlas");
  app.exit(0);
}

function stripToRgba(image) {
  const { width, height } = image.getSize();
  const bgra = image.toBitmap();
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = bgra[index * 4 + 2];
    rgba[index * 4 + 1] = bgra[index * 4 + 1];
    rgba[index * 4 + 2] = bgra[index * 4];
    rgba[index * 4 + 3] = bgra[index * 4 + 3];
  }
  return { data: rgba, width, height };
}

app.whenReady().then(main).catch((error) => {
  console.error("E2E_FAIL:", error.stack || error.message);
  app.exit(1);
});
