// Smoke check: run the u2netp cutout pipeline in plain Node on a synthetic
// "person" (light figure on a dark background) and assert the mask separates
// foreground from background. Run: node scripts/smoke-lite-cutout.cjs
const path = require("node:path");

async function main() {
  const ort = require("onnxruntime-node");
  const { inferMask } = require("../electron/litePet.cjs");
  const modelPath = path.join(__dirname, "..", "electron", "models", "u2netp.onnx");

  const width = 480;
  const height = 640;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const head = ((x - 240) / 90) ** 2 + ((y - 170) / 110) ** 2 <= 1;
      const body = x > 150 && x < 330 && y > 260 && y < 560;
      if (head || body) {
        rgba[index] = 245; rgba[index + 1] = 240; rgba[index + 2] = 235;
      } else {
        rgba[index] = 24; rgba[index + 1] = 30; rgba[index + 2] = 44;
      }
      rgba[index + 3] = 255;
    }
  }

  const session = await ort.InferenceSession.create(modelPath);
  const mask = await inferMask(ort, session, rgba, width, height);
  void session;
  const plane = 320 * 320;
  let insideSum = 0;
  let insideCount = 0;
  let outsideSum = 0;
  let outsideCount = 0;
  for (let y = 0; y < 320; y += 1) {
    for (let x = 0; x < 320; x += 1) {
      const sourceX = Math.floor((x / 320) * width);
      const sourceY = Math.floor((y / 320) * height);
      const index = (sourceY * width + sourceX) * 4;
      const isFigure = rgba[index] > 128;
      if (isFigure) { insideSum += mask[y * 320 + x]; insideCount += 1; }
      else { outsideSum += mask[y * 320 + x]; outsideCount += 1; }
    }
  }
  const insideMean = insideSum / insideCount;
  const outsideMean = outsideSum / outsideCount;
  console.log(JSON.stringify({ insideMean: insideMean.toFixed(1), outsideMean: outsideMean.toFixed(1) }));
  if (insideMean < 140 || outsideMean > 90 || insideMean - outsideMean < 60) {
    console.error("FAIL: mask does not separate figure from background");
    process.exit(1);
  }
  console.log("SMOKE_OK: u2netp separates the figure from the background");
}

main().catch((error) => {
  console.error("SMOKE_FAIL:", error.message);
  process.exit(1);
});
