const assert = require("node:assert/strict");
const test = require("node:test");
const { PET_HIT_AREA, isPetHitTarget } = require("../electron/pet-hit-area.cjs");

test("the whole visible pet bounds accept pointer input, including edges", () => {
  for (const [x, y] of [
    [PET_HIT_AREA.left, 180],
    [PET_HIT_AREA.right, 180],
    [125, PET_HIT_AREA.top],
    [125, PET_HIT_AREA.bottom],
    [28, 145],
    [220, 280],
  ]) assert.equal(isPetHitTarget(x, y), true, `expected interactive point ${x},${y}`);
});

test("transparent window gutters stay click-through", () => {
  for (const [x, y] of [[0, 0], [15, 180], [235, 180], [125, 63], [125, 305], [249, 309]]) {
    assert.equal(isPetHitTarget(x, y), false, `expected pass-through point ${x},${y}`);
  }
});
