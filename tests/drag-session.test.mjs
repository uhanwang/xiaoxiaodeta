import assert from "node:assert/strict";
import test from "node:test";
import { createDragSession, DRAG_THRESHOLD_PX, updateDragSession } from "../src/dragSession.js";

const pointer = (x, y) => ({ pointerId: 1, screenX: x, screenY: y, clientX: x, clientY: y });

test("drag starts only after moving more than five logical pixels", () => {
  const session = createDragSession(pointer(100, 100));
  updateDragSession(session, pointer(103, 104));
  assert.equal(session.started, false);
  updateDragSession(session, pointer(104, 103));
  assert.equal(Math.hypot(session.latestDelta.x, session.latestDelta.y), DRAG_THRESHOLD_PX);
  assert.equal(session.started, false);
  updateDragSession(session, pointer(104, 104));
  assert.equal(session.started, true);
  assert.equal(session.moved, true);
});

test("pointer cancellation can be distinguished from an ordinary tap", () => {
  const session = createDragSession(pointer(10, 20));
  updateDragSession(session, pointer(11, 20));
  session.cancelled = true;
  session.released = true;
  assert.equal(session.started, false);
  assert.equal(session.cancelled, true);
  assert.deepEqual(session.latestDelta, { x: 1, y: 0 });
});

test("drag sessions keep the latest desktop pointer position for multi-monitor clamping", () => {
  const session = createDragSession(pointer(100, 100));
  updateDragSession(session, pointer(120, 108));
  assert.deepEqual(session.latestPointerPoint, { x: 120, y: 108 });
});

test("drag deltas stay relative to the original pointer when the window follows the cursor", () => {
  const session = createDragSession(pointer(10, 20));
  updateDragSession(session, pointer(20, 30));
  updateDragSession(session, pointer(32, 41));
  assert.deepEqual(session.latestDelta, { x: 22, y: 21 });
  assert.deepEqual(session.latestPointerPoint, { x: 32, y: 41 });
});
