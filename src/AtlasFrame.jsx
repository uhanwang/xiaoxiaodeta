import { useEffect, useState } from "react";
import { atlasCellStyle, spriteSheetCellStyle } from "./actionRegistry.js";
import { WardrobeOverlay } from "./WardrobeOverlay.jsx";

function wardrobePath(source, outfit) {
  if (!source || !outfit || outfit === "default") return source;
  return `./assets/wardrobe/${outfit}/${source.replace(/^\.\/assets\//, "")}`;
}

export function AtlasFrame({
  row,
  frames = 1,
  loopMs = 1000,
  className = "",
  label = "桌宠动作",
  sprite,
  columns = 1,
  sheetRows = 1,
  frameOffset = 0,
  outfit = "default",
  accessories,
  accessoryId = "none",
  frameSequence,
  gestureChoice,
}) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    if (frames <= 1) return undefined;
    const timer = window.setInterval(() => setFrame((current) => (current + 1) % frames), loopMs / frames);
    return () => window.clearInterval(timer);
  }, [frames, loopMs, row, sprite, columns, sheetRows, frameOffset]);
  const activeFrame = frameSequence?.length ? frameSequence[frame % frameSequence.length] : frame;
  const wardrobeSprite = wardrobePath(sprite, outfit);
  const wardrobeAtlas = wardrobePath("./assets/atlas/pet-actions-installed.webp", outfit);
  const style = sprite
    ? spriteSheetCellStyle(wardrobeSprite, activeFrame, columns, sheetRows)
    : atlasCellStyle(row, frameOffset + frame, wardrobeAtlas);
  return (
    <div className={`atlas-frame ${sprite ? "sheet-frame" : ""} ${className}`} role="img" aria-label={label} style={style}>
      <WardrobeOverlay accessories={accessories} accessoryId={accessoryId} row={row} sprite={sprite} />
      {gestureChoice && <RpsGestureOverlay choice={gestureChoice} />}
    </div>
  );
}

function RpsGestureOverlay({ choice }) {
  if (choice !== "scissors") return null;
  return (
    <svg className="rps-gesture-overlay rps-gesture-scissors" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <circle cx="91" cy="17" r="7.5" fill="#fffaf0" stroke="#d8b97d" strokeWidth="0.75" />
      <text x="91" y="20" textAnchor="middle" fontFamily="Segoe UI Symbol, Microsoft YaHei UI, sans-serif" fontSize="8.5" fill="#a86b77">✌</text>
    </svg>
  );
}
