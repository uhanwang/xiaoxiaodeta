import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  REQUIRED_CELLS,
  atlasQA,
  composeAtlas,
  cyanKeyAlpha,
  mirrorRgba,
  registerRowFrames,
  splitStripFrames,
} = require("../electron/atlasCompose.cjs");

function solidFrame(width, height, color) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = color[0];
    data[index * 4 + 1] = color[1];
    data[index * 4 + 2] = color[2];
    data[index * 4 + 3] = 255;
  }
  return { data, width, height };
}

test("cyanKeyAlpha keeps the subject and unmasks the cyan backdrop", () => {
  const frame = new Uint8ClampedArray(2 * 2 * 4);
  // left pixel: pure cyan background; right pixel: red subject.
  frame.set([0, 255, 255, 255], 0);
  frame.set([200, 30, 40, 255], 4);
  const keyed = cyanKeyAlpha(frame);
  assert.equal(keyed[3], 0, "cyan pixel becomes transparent");
  assert.ok(keyed[7] > 200, "subject pixel stays opaque");
  assert.ok(keyed[4] > 150 && keyed[4] < 255, "subject red survives unmixing");
});

test("mirrorRgba flips columns", () => {
  const frame = solidFrame(2, 1, [0, 0, 0]);
  frame.data[0] = 9;
  const mirrored = mirrorRgba(frame.data, 2, 1);
  assert.equal(mirrored[0], 0);
  assert.equal(mirrored[4], 9);
});

test("splitStripFrames cuts a wide strip into equal frames", () => {
  const strip = solidFrame(600, 100, [10, 20, 30]);
  const frames = splitStripFrames(strip, 6);
  assert.equal(frames.length, 6);
  for (const frame of frames) assert.equal(frame.width, 100);
});

test("registerRowFrames centers frames on a shared baseline without touching edges", () => {
  // Frame: a 60x80 subject in the middle of a 200x240 canvas.
  const frame = solidFrame(200, 240, [255, 255, 255]);
  for (let y = 100; y < 180; y += 1) {
    for (let x = 70; x < 130; x += 1) {
      const index = (y * 200 + x) * 4;
      frame.data[index] = 200; frame.data[index + 1] = 60; frame.data[index + 2] = 90;
    }
  }
  const cells = registerRowFrames([frame, frame]);
  assert.equal(cells.length, 2);
  const { alphaBoundingBox } = require("../electron/imageOps.cjs");
  for (const cell of cells) {
    const box = alphaBoundingBox(cell, 192, 208, 8);
    assert.ok(box, "cell has content");
    assert.ok(box.left > 0 && box.right < 191, "does not touch side edges");
    assert.ok(box.top > 0 && box.bottom < 207, "does not touch top/bottom edges");
  }
});

function qaCleanCell() {
  // A cell-safe blob: inset so no pixel touches the cell border.
  const cell = new Uint8ClampedArray(192 * 208 * 4);
  for (let y = 12; y < 196; y += 1) {
    for (let x = 16; x < 176; x += 1) {
      const index = (y * 192 + x) * 4;
      cell[index] = 200; cell[index + 1] = 90; cell[index + 2] = 120; cell[index + 3] = 255;
    }
  }
  return cell;
}

test("composeAtlas + atlasQA accept a well-formed atlas", () => {
  const cell = qaCleanCell();
  const rows = {
    0: Array(7).fill(cell),
    1: Array(8).fill(cell),
    2: Array(8).fill(cell),
    3: Array(4).fill(cell),
    4: Array(5).fill(cell),
    5: Array(8).fill(cell),
    6: Array(6).fill(cell),
    7: Array(6).fill(cell),
    8: Array(6).fill(cell),
    9: Array(8).fill(cell),
    10: Array(8).fill(cell),
  };
  const atlas = composeAtlas(rows);
  assert.equal(atlas.length, 192 * 8 * 208 * 11 * 4);
  const qa = atlasQA(atlas);
  assert.deepEqual(qa.errors, []);
  assert.equal(qa.ok, true);
  assert.deepEqual(Object.values(REQUIRED_CELLS).sort((a, b) => a - b), [4, 5, 6, 6, 6, 7, 8, 8, 8, 8, 8]);
});

test("atlasQA rejects an empty required cell and stray content", () => {
  const cell = qaCleanCell();
  const atlas = composeAtlas({ 3: Array(4).fill(cell) });
  const qa = atlasQA(atlas);
  assert.equal(qa.ok, false);
  assert.ok(qa.errors.some((message) => message.includes("row 0")));
});
