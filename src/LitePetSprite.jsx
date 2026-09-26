import { liteRenderSpec } from "./litePetMode.js";

// Renders the photo-based pet. Without per-frame art, expressiveness comes
// from transform animations: breathe, scurry, tilt, bounce — see styles.css.
export function LitePetSprite({ manifest, actionId, effect }) {
  const spec = liteRenderSpec(manifest, actionId);
  if (!spec) return null;
  return (
    <span className={`lite-pet-sprite lite-anim-${spec.animation} lite-facing-${spec.facing}`}>
      <img src={spec.src} alt="桌宠" draggable="false" />
      {effect && <i className="lite-pet-glow" aria-hidden="true" />}
    </span>
  );
}
