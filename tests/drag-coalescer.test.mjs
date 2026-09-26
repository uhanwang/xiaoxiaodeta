import test from "node:test";
import assert from "node:assert/strict";
import { createFrameCoalescer } from "../src/dragCoalescer.js";

function createFrameHarness() {
  let nextId = 1;
  const callbacks = new Map();
  return {
    callbacks,
    requestFrame(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      callbacks.delete(id);
    },
    tick() {
      const queued = [...callbacks.values()];
      callbacks.clear();
      for (const callback of queued) callback();
    },
  };
}

test("coalesces rapid pointer updates to the newest position in one frame", () => {
  const frames = createFrameHarness();
  const delivered = [];
  const coalescer = createFrameCoalescer((value) => delivered.push(value), frames);

  for (let index = 0; index < 120; index += 1) {
    coalescer.schedule({ x: index, y: index * 2 });
  }

  assert.equal(frames.callbacks.size, 1);
  frames.tick();
  assert.deepEqual(delivered, [{ x: 119, y: 238 }]);
});

test("flush delivers the release position and cancels a queued frame", () => {
  const frames = createFrameHarness();
  const delivered = [];
  const coalescer = createFrameCoalescer((value) => delivered.push(value), frames);
  coalescer.schedule({ x: 20, y: 10 });
  coalescer.schedule({ x: 41, y: 28 });
  coalescer.flush();
  frames.tick();

  assert.deepEqual(delivered, [{ x: 41, y: 28 }]);
  assert.equal(frames.callbacks.size, 0);
});

test("cancel discards pending movement", () => {
  const frames = createFrameHarness();
  const delivered = [];
  const coalescer = createFrameCoalescer((value) => delivered.push(value), frames);
  coalescer.schedule({ x: 20, y: 10 });
  coalescer.cancel();
  frames.tick();

  assert.deepEqual(delivered, []);
  assert.equal(frames.callbacks.size, 0);
});
