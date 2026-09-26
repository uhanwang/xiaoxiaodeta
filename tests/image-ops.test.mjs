import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  alphaBoundingBox,
  applyMaskAlpha,
  cropRgba,
  resizeBilinear,
  rgbaFromBgra,
} = require("../electron/imageOps.cjs");

test("rgbaFromBgra swaps red and blue channels", () => {
  const bgra = new Uint8ClampedArray([10, 20, 30, 40]);
  const rgba = rgbaFromBgra(bgra, 1, 1);
  assert.deepEqual([...rgba], [30, 20, 10, 40]);
});

test("resizeBilinear keeps dimensions and averages interior colors", () => {
  // 2x2 image: left column red, right column blue.
  const source = new Uint8ClampedArray([
    255, 0, 0, 255, 0, 0, 255, 255,
    255, 0, 0, 255, 0, 0, 255, 255,
  ]);
  const up = resizeBilinear(source, 2, 2, 4, 4);
  assert.equal(up.length, 4 * 4 * 4);
  const firstPixel = [up[0], up[1], up[2]];
  const lastPixel = up.slice((4 * 4 - 1) * 4, (4 * 4 - 1) * 4 + 3);
  assert.deepEqual(firstPixel, [255, 0, 0]);
  assert.deepEqual([...lastPixel], [0, 0, 255]);
  const middle = up.slice((2 * 4 + 1) * 4, (2 * 4 + 1) * 4 + 3);
  assert.ok(middle[0] > 40 && middle[0] < 215, "middle pixel blends red and blue");
});

test("applyMaskAlpha multiplies alpha by the mask", () => {
  const rgba = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
  const mask = new Uint8ClampedArray([255, 255, 0, 128]);
  const masked = applyMaskAlpha(rgba, 2, 2, mask, 2, 2);
  assert.equal(masked[3], 255);
  assert.equal(masked[2 * 4 + 3], 0);
  assert.ok(Math.abs(masked[3 * 4 + 3] - 128) <= 1);
});

test("alphaBoundingBox finds the opaque region", () => {
  const width = 4;
  const height = 4;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 1; y <= 2; y += 1) {
    for (let x = 2; x <= 3; x += 1) {
      rgba[(y * width + x) * 4 + 3] = 255;
    }
  }
  const box = alphaBoundingBox(rgba, width, height);
  assert.deepEqual(box, { left: 2, top: 1, right: 3, bottom: 2 });
  assert.equal(alphaBoundingBox(rgba, 1, 1), null);
});

test("cropRgba extracts the boxed region", () => {
  const width = 3;
  const height = 3;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba[pixel * 4] = pixel;
    rgba[pixel * 4 + 3] = 255;
  }
  const cropped = cropRgba(rgba, width, height, { left: 1, top: 0, right: 2, bottom: 1 });
  assert.equal(cropped.width, 2);
  assert.equal(cropped.height, 2);
  assert.equal(cropped.data[0], 1);
  assert.equal(cropped.data[2 * 4], 4);
});
