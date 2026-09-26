import assert from "node:assert/strict";
import test from "node:test";

import { PET_ACTIONS } from "../src/actionRegistry.js";
import { liteAnimationFor, liteFacingFor, liteRenderSpec, liteRoleFor } from "../src/litePetMode.js";

const fullManifest = {
  type: "lite",
  images: {
    idle: "idle.png",
    wave: "wave.png",
    happy: "happy.png",
    sit: "sit.png",
  },
};

test("liteRoleFor falls back to idle when a role is missing", () => {
  assert.equal(liteRoleFor(fullManifest, "idle"), "idle");
  assert.equal(liteRoleFor(fullManifest, "wave"), "wave");
  assert.equal(liteRoleFor(fullManifest, "fail"), "idle");
  assert.equal(liteRoleFor(fullManifest, "sit"), "sit");
  assert.equal(liteRoleFor(fullManifest, "sleep"), "sit");
  assert.equal(liteRoleFor(fullManifest, "rps-paper"), "wave");
});

test("render spec points at the served lite asset route", () => {
  const spec = liteRenderSpec(fullManifest, "wave");
  assert.equal(spec.src, "./assets/custom/lite/wave.png");
  assert.equal(spec.animation, "wave");
  assert.equal(spec.facing, "front");
});

test("run actions scurry and face their direction", () => {
  assert.equal(liteRenderSpec(fullManifest, "run-left").facing, "left");
  assert.equal(liteRenderSpec(fullManifest, "run-left").animation, "scurry");
  assert.equal(liteFacingFor("run-right"), "right");
  assert.equal(liteFacingFor("idle"), "front");
});

test("every registered atlas action maps to a usable sprite", () => {
  const ids = PET_ACTIONS.map((action) => action.id).concat(["sit", "sleep", "drag", "blink"]);
  for (const id of ids) {
    const spec = liteRenderSpec(fullManifest, id);
    assert.ok(spec, `action ${id} should render in lite mode`);
    assert.ok(spec.src.endsWith(".png"));
    assert.ok(spec.animation);
  }
  assert.equal(liteAnimationFor("unknown-action"), "breathe");
});
