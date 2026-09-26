// Pure mapping from pet actions/states onto the lite (photo-based) pet's
// sprites and CSS transform animations. Unit-tested without Electron.

export const LITE_IMAGE_BASE = "./assets/custom/lite/";

export const LITE_ROLE_OPTIONS = [
  ["idle", "日常站姿（必选）"],
  ["wave", "挥手打招呼"],
  ["happy", "开心笑脸"],
  ["shy", "害羞表情"],
  ["fail", "失落神态"],
  ["waiting", "等待陪伴"],
  ["review", "认真查看"],
  ["sit", "坐姿"],
  ["sleep", "睡觉"],
];

const ROLE_FALLBACKS = {
  idle: "idle",
  wave: ["wave", "idle"],
  happy: ["happy", "idle"],
  shy: ["shy", "happy", "idle"],
  fail: ["fail", "shy", "idle"],
  waiting: ["waiting", "idle"],
  review: ["review", "idle"],
  sit: ["sit", "waiting", "idle"],
  sleep: ["sleep", "sit", "idle"],
  run: ["idle"],
  feed: ["happy", "idle"],
  pet: ["happy", "idle"],
  hug: ["happy", "idle"],
  celebrate: ["happy", "wave", "idle"],
  heart: ["happy", "idle"],
  wake: ["happy", "idle"],
  "run-left": ["idle"],
  "run-right": ["idle"],
  "rps-rock": ["wave", "idle"],
  "rps-scissors": ["wave", "idle"],
  "rps-paper": ["wave", "idle"],
};

const ACTION_ANIMATIONS = {
  idle: "breathe",
  wave: "wave",
  happy: "bounce",
  shy: "shy",
  fail: "droop",
  waiting: "breathe",
  review: "review",
  sit: "rest",
  sleep: "rest",
  run: "scurry",
  "run-left": "scurry",
  "run-right": "scurry",
  feed: "bounce",
  pet: "bounce",
  hug: "bounce",
  celebrate: "jump",
  heart: "bounce",
  wake: "jump",
  blink: "breathe",
  drag: "drag",
  "rps-rock": "shake",
  "rps-scissors": "shake",
  "rps-paper": "shake",
};

export function liteRoleFor(manifest, actionId) {
  const images = manifest?.images || {};
  if (!images.idle) return null;
  const chain = ROLE_FALLBACKS[actionId] || [actionId, "idle"];
  for (const role of chain) {
    if (images[role]) return role;
  }
  return "idle";
}

export function liteAnimationFor(actionId) {
  return ACTION_ANIMATIONS[actionId] || "breathe";
}

// The walk cycle has no leg frames, so the sprite faces its direction instead.
export function liteFacingFor(actionId) {
  if (actionId === "run-left") return "left";
  if (actionId === "run-right") return "right";
  return "front";
}

export function liteRenderSpec(manifest, actionId) {
  if (!manifest) return null;
  const role = liteRoleFor(manifest, actionId);
  if (!role) return null;
  return {
    src: `${LITE_IMAGE_BASE}${manifest.images[role]}`,
    animation: liteAnimationFor(actionId),
    facing: liteFacingFor(actionId),
  };
}
