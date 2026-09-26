from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "assets"
OUTFITS = {
    "rose": (245, 205, 211),
    "sky": (205, 226, 239),
    "moon": (221, 211, 237),
    "strawberry": (250, 194, 203),
    "winter": (222, 237, 244),
    "sailor": (179, 215, 232),
    "wizard": (207, 190, 230),
    "sunset": (247, 213, 170),
}
SOURCES = [
    (PUBLIC / "atlas" / "pet-actions-installed.webp", "atlas", 8, 11, 0.42, 0.86, 0.17, 0.83),
    (PUBLIC / "actions" / "heart-gesture-v1.png", "actions", 4, 2, 0.42, 0.88, 0.14, 0.86),
    (PUBLIC / "actions" / "shy-gesture-v1.png", "actions", 4, 2, 0.42, 0.88, 0.14, 0.86),
    (PUBLIC / "actions" / "celebrate-gesture-v1.png", "actions", 4, 2, 0.42, 0.88, 0.14, 0.86),
]
SOURCES.extend(
    (path, "sprites", 1, 1, 0.40, 0.88, 0.12, 0.88)
    for path in sorted((PUBLIC / "sprites").glob("*.png"))
)


def recolor_cell(cell: Image.Image, color: tuple[int, int, int], limits: tuple[float, float, float, float]) -> Image.Image:
    pixels = np.array(cell.convert("RGBA"), dtype=np.uint8)
    height, width = pixels.shape[:2]
    x1, x2, y1, y2 = limits
    yy, xx = np.mgrid[0:height, 0:width]
    roi = (xx >= width * x1) & (xx <= width * x2) & (yy >= height * y1) & (yy <= height * y2)
    rgb = pixels[..., :3].astype(np.float32)
    high = rgb.max(axis=2)
    low = rgb.min(axis=2)
    saturation = np.divide(high - low, high, out=np.zeros_like(high), where=high > 0)
    alpha = pixels[..., 3]
    mask = roi & (alpha > 80) & (saturation < 0.22) & (high >= 0.56 * 255)
    brightness = high / 255.0
    shade = 0.74 + 0.26 * brightness
    target = np.array(color, dtype=np.float32).reshape(1, 1, 3) * shade[..., None]
    strength = np.clip((0.25 - saturation) / 0.12, 0, 1)[..., None]
    mix = strength * 0.68
    pixels[..., :3][mask] = np.clip(rgb[mask] * (1 - mix[mask]) + target[mask] * mix[mask], 0, 255).astype(np.uint8)
    return Image.fromarray(pixels, "RGBA")


def build_variant(source: Path, target: Path, columns: int, rows: int, limits: tuple[float, float, float, float], color: tuple[int, int, int]) -> int:
    image = Image.open(source).convert("RGBA")
    if image.width % columns or image.height % rows:
        raise ValueError(f"Sprite sheet dimensions do not fit its grid: {source} {image.size} {columns}x{rows}")
    cell_width = image.width // columns
    cell_height = image.height // rows
    result = Image.new("RGBA", image.size)
    changed = 0
    for row in range(rows):
        for column in range(columns):
            box = (column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height)
            cell = image.crop(box)
            variant = recolor_cell(cell, color, limits)
            changed += int(np.any(np.array(variant) != np.array(cell)))
            result.paste(variant, box[:2])
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.suffix.lower() == ".webp":
        result.save(target, "WEBP", lossless=True, quality=100, method=6)
    else:
        result.save(target, "PNG", optimize=True)
    return changed


def main() -> None:
    summary = []
    for source, group, columns, rows, y1, y2, x1, x2 in SOURCES:
        if not source.exists():
            raise FileNotFoundError(source)
        for outfit, color in OUTFITS.items():
            target = PUBLIC / "wardrobe" / outfit / group / source.name
            changed_cells = build_variant(source, target, columns, rows, (x1, x2, y1, y2), color)
            summary.append(f"{target.relative_to(ROOT)}: changed-cells={changed_cells}")
    print("\n".join(summary))
    print(f"Generated {len(summary)} locally recolored sprite sheets from the installed character assets.")


if __name__ == "__main__":
    main()
