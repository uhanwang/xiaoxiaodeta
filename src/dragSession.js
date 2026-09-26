export const DRAG_THRESHOLD_PX = 5;

export function createDragSession(event) {
  return {
    pointerId: event.pointerId,
    startX: event.screenX,
    startY: event.screenY,
    startClientX: event.clientX,
    startClientY: event.clientY,
    latestDelta: { x: 0, y: 0 },
    latestPointerPoint: { x: event.screenX, y: event.screenY },
    started: false,
    moved: false,
    released: false,
    cancelled: false,
  };
}

export function updateDragSession(session, event) {
  const screenDx = event.screenX - session.startX;
  const screenDy = event.screenY - session.startY;
  const clientDx = event.clientX - session.startClientX;
  const clientDy = event.clientY - session.startClientY;
  const delta = {
    x: screenDx === 0 && clientDx !== 0 ? clientDx : screenDx,
    y: screenDy === 0 && clientDy !== 0 ? clientDy : screenDy,
  };
  session.latestDelta = delta;
  if (Number.isFinite(event.screenX) && Number.isFinite(event.screenY)) {
    session.latestPointerPoint = { x: event.screenX, y: event.screenY };
  }
  session.latestEventAt = Date.now();
  if (Math.hypot(delta.x, delta.y) > DRAG_THRESHOLD_PX) {
    session.moved = true;
    session.started = true;
  }
  return delta;
}
