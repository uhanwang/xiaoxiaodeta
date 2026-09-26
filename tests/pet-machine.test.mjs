import assert from "node:assert/strict";
import test from "node:test";
import { autoStateForIdleTime } from "../src/petMachine.js";

test("pet stays idle during active use", () => {
  assert.equal(autoStateForIdleTime(24_999), "idle");
});

test("pet sits after a short idle period", () => {
  assert.equal(autoStateForIdleTime(25_000), "sit");
  assert.equal(autoStateForIdleTime(59_999), "sit");
});

test("pet sleeps after a long idle period", () => {
  assert.equal(autoStateForIdleTime(60_000), "sleep");
});
