import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { atlasFeedback } = require("../electron/atlas-feedback.cjs");

test("size failures point to the atlas spec", () => {
  const message = atlasFeedback(new Error("The atlas must be 1536x2288; received 512x512"));
  assert.match(message, /1536×2288/);
  assert.match(message, /docs\/ATLAS-FORMAT\.md/);
});

test("non-png sources ask for conversion", () => {
  const message = atlasFeedback(new Error("The atlas must be normalized to PNG before installation"));
  assert.match(message, /PNG/);
});

test("undecodable files ask the user to re-check the image", () => {
  const message = atlasFeedback(new Error("Electron could not decode the atlas image"));
  assert.match(message, /无法读取/);
});

test("unknown failures keep the original detail", () => {
  const message = atlasFeedback(new Error("boom"));
  assert.ok(message.includes("boom"));
});
