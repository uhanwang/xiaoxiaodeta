// Headless end-to-end check for the lite pet pipeline, run under Electron:
//   npx electron scripts/e2e-lite-cutout.cjs
// Builds a synthetic photo, installs it as a lite pet into a temp userData,
// and verifies the cutout PNG + manifest + active-mode marker land on disk.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, nativeImage } = require("electron");

async function main() {
  const { installLitePet, liteManifestPath, readActiveMode, liteDir } = require("../electron/litePet.cjs");

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "lite-e2e-"));
  app.setPath("userData", userData);

  const width = 480;
  const height = 640;
  const bgra = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const head = ((x - 240) / 90) ** 2 + ((y - 170) / 110) ** 2 <= 1;
      const body = x > 150 && x < 330 && y > 260 && y < 560;
      if (head || body) {
        bgra[index] = 235; bgra[index + 1] = 240; bgra[index + 2] = 245;
      } else {
        bgra[index] = 44; bgra[index + 1] = 30; bgra[index + 2] = 24;
      }
      bgra[index + 3] = 255;
    }
  }
  const photoPath = path.join(userData, "input.png");
  const photo = nativeImage.createFromBitmap(bgra, { width, height });
  fs.writeFileSync(photoPath, photo.toPNG());

  const modelPath = path.join(__dirname, "..", "electron", "models", "u2netp.onnx");
  const ort = require("onnxruntime-node");
  const result = await installLitePet(
    [{ role: "idle", sourcePath: photoPath }],
    userData,
    { nativeImage, ort, modelPath },
  );

  const manifest = JSON.parse(fs.readFileSync(liteManifestPath(userData), "utf8"));
  const outputPng = path.join(liteDir(userData), "idle.png");
  const cutout = nativeImage.createFromPath(outputPng);
  const size = cutout.getSize();
  const bitmap = cutout.toBitmap();
  let transparentPixels = 0;
  let opaquePixels = 0;
  const pixels = size.width * size.height;
  for (let index = 0; index < pixels; index += 1) {
    const alpha = bitmap[index * 4 + 3];
    if (alpha < 8) transparentPixels += 1;
    if (alpha > 240) opaquePixels += 1;
  }

  const summary = {
    roles: result.roles,
    manifestImages: manifest.images,
    mode: readActiveMode(userData),
    cutoutSize: size,
    transparentRatio: (transparentPixels / pixels).toFixed(2),
    opaqueRatio: (opaquePixels / pixels).toFixed(2),
  };
  console.log(JSON.stringify(summary));

  const failures = [];
  if (summary.mode !== "lite") failures.push("active mode is not lite");
  if (manifest.images.idle !== "idle.png") failures.push("manifest idle entry missing");
  // The sprite is cropped to the figure's bounding box, so most of it is the
  // figure itself; the background inside the box (head corners) goes transparent.
  if (transparentRatio(summary) < 0.04) failures.push("cutout has almost no transparency");
  if (opaqueRatio(summary) < 0.5) failures.push("cutout lost its figure");
  if (failures.length) {
    console.error("E2E_FAIL:", failures.join("; "));
    app.exit(1);
    return;
  }
  console.log("E2E_OK: lite pet installed and cutout is a valid sprite");
  app.exit(0);
}

function transparentRatio(summary) {
  return Number(summary.transparentRatio);
}
function opaqueRatio(summary) {
  return Number(summary.opaqueRatio);
}

app.whenReady().then(main).catch((error) => {
  console.error("E2E_FAIL:", error.stack || error.message);
  app.exit(1);
});
