export function createFrameCoalescer(onFrame, {
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
} = {}) {
  let frameId = null;
  let latestValue;
  let hasValue = false;

  const deliver = () => {
    frameId = null;
    if (!hasValue) return;
    const value = latestValue;
    latestValue = undefined;
    hasValue = false;
    onFrame(value);
  };

  return {
    schedule(value) {
      latestValue = value;
      hasValue = true;
      if (frameId === null) frameId = requestFrame(deliver);
    },
    flush() {
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
      if (!hasValue) return;
      const value = latestValue;
      latestValue = undefined;
      hasValue = false;
      onFrame(value);
    },
    cancel() {
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
      latestValue = undefined;
      hasValue = false;
    },
  };
}
