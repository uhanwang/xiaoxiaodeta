import assert from "node:assert/strict";
import test from "node:test";
import { ATLAS, GAZE_DIRECTIONS, PET_ACTIONS, atlasCellStyle, directionForGaze, gazeIndexFromPoint, spriteSheetCellStyle } from "../src/actionRegistry.js";

test("the registry preserves all installed rows, adds gesture sheets, and registers care interactions", () => {
  assert.equal(PET_ACTIONS.length, 18);
  assert.deepEqual(PET_ACTIONS.slice(0, 9).map((action) => action.row), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(PET_ACTIONS.slice(9, 12).map(({ id, frames, columns, sheetRows }) => ({ id, frames, columns, sheetRows })), [
    { id: "heart", frames: 8, columns: 4, sheetRows: 2 },
    { id: "shy", frames: 8, columns: 4, sheetRows: 2 },
    { id: "celebrate", frames: 8, columns: 4, sheetRows: 2 },
  ]);
  assert.deepEqual(PET_ACTIONS.slice(12, 15).map(({ id, gestureChoice }) => ({ id, gestureChoice })), [
    { id: "rps-rock", gestureChoice: "rock" },
    { id: "rps-scissors", gestureChoice: "scissors" },
    { id: "rps-paper", gestureChoice: "paper" },
  ]);
  assert.deepEqual(PET_ACTIONS.slice(15).map(({ id, group }) => ({ id, group })), [
    { id: "feed", group: "互动" },
    { id: "pet", group: "互动" },
    { id: "hug", group: "互动" },
  ]);
  assert.equal(GAZE_DIRECTIONS.length, 16);
  assert.equal(new Set(GAZE_DIRECTIONS.map(({ row, column }) => `${row}:${column}`)).size, 16);
  assert.deepEqual(ATLAS, { columns: 8, rows: 11, cellWidth: 192, cellHeight: 208 });
});

test("cursor directions follow the atlas clockwise from front", () => {
  const origin = { x: 100, y: 100 };
  assert.equal(gazeIndexFromPoint(origin, { x: 100, y: 0 }), 0);
  assert.equal(gazeIndexFromPoint(origin, { x: 200, y: 100 }), 4);
  assert.equal(gazeIndexFromPoint(origin, { x: 100, y: 200 }), 8);
  assert.equal(gazeIndexFromPoint(origin, { x: 0, y: 100 }), 12);
  assert.equal(directionForGaze(-1).id, 15);
});

test("atlas CSS positions clamp to the 8 by 11 sheet boundary", () => {
  const first = atlasCellStyle(0, 0);
  assert.equal(first.backgroundPosition, "0% 0%");
  const last = atlasCellStyle(100, 100);
  assert.equal(last.backgroundPosition, "100% 100%");
  assert.equal(last.backgroundSize, "800% 1100%");
});

test("new 4 by 2 sprite sheets address all eight frames without touching the gaze atlas", () => {
  assert.deepEqual(spriteSheetCellStyle("./assets/actions/heart.png", 0, 4, 2), {
    backgroundImage: 'url("./assets/actions/heart.png")',
    backgroundSize: "400% 200%",
    backgroundPosition: "0% 0%",
  });
  assert.equal(spriteSheetCellStyle("./assets/actions/heart.png", 7, 4, 2).backgroundPosition, "100% 100%");
  assert.equal(atlasCellStyle(10, 7).backgroundPosition, "100% 100%");
});
