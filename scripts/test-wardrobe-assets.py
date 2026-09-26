from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "assets"
OUTFITS = ("rose", "sky", "moon", "strawberry", "winter", "sailor", "wizard", "sunset")
SOURCES = [
    (PUBLIC / "atlas" / "pet-actions-installed.webp", "atlas", 8, 11, 0.42, 0.86, 0.17, 0.83),
    (PUBLIC / "actions" / "heart-gesture-v1.png", "actions", 4, 2, 0.42, 0.88, 0.14, 0.86),
    (PUBLIC / "actions" / "shy-gesture-v1.png", "actions", 4, 2, 0.42, 0.88, 0.14, 0.86),
    (PUBLIC / "actions" / "celebrate-gesture-v1.png", "actions", 4, 2, 0.42, 0.88, 0.14, 0.86),
]
SOURCES.extend((path, "sprites", 1, 1, 0.40, 0.88, 0.12, 0.88) for path in sorted((PUBLIC / "sprites").glob("*.png")))


def main() -> None:
    checked = 0
    for source, group, columns, rows, y1, y2, x1, x2 in SOURCES:
        original = np.array(Image.open(source).convert("RGBA"))
        for outfit in OUTFITS:
            target = PUBLIC / "wardrobe" / outfit / group / source.name
            if not target.exists():
                raise FileNotFoundError(target)
            actual = np.array(Image.open(target).convert("RGBA"))
            if actual.shape != original.shape:
                raise AssertionError(f"Size mismatch: {target} {actual.shape} != {original.shape}")
            if not np.array_equal(actual[..., 3], original[..., 3]):
                raise AssertionError(f"Wardrobe changed alpha/transparency: {target}")
            changed = np.any(actual[..., :3] != original[..., :3], axis=2) & (original[..., 3] > 0)
            height, width = original.shape[:2]
            cell_w, cell_h = width // columns, height // rows
            min_changed = 0
            for row in range(rows):
                for column in range(columns):
                    cell = changed[row * cell_h:(row + 1) * cell_h, column * cell_w:(column + 1) * cell_w]
                    yy, xx = np.mgrid[0:cell_h, 0:cell_w]
                    in_body = (xx >= cell_w * x1) & (xx <= cell_w * x2) & (yy >= cell_h * y1) & (yy <= cell_h * y2)
                    min_changed += int(np.count_nonzero(cell & in_body) >= 12)
            if min_changed < max(1, columns * rows // 3):
                raise AssertionError(f"Outfit tint is missing from many frames: {target} ({min_changed}/{columns * rows})")
            checked += 1

    atlas_source = PUBLIC / "atlas" / "pet-actions-installed.webp"
    atlas = Image.open(atlas_source).convert("RGBA")
    labels = [("BASE", atlas)]
    for outfit in OUTFITS:
        labels.append((outfit.upper(), Image.open(PUBLIC / "wardrobe" / outfit / "atlas" / atlas_source.name).convert("RGBA")))
    thumb_w, thumb_h = 74, 80
    margin = 92
    preview = Image.new("RGB", (margin + 16 * thumb_w, 4 * 104), (248, 243, 244))
    draw = ImageDraw.Draw(preview)
    font = ImageFont.load_default()
    for row_index, (label, sheet) in enumerate(labels):
        draw.text((10, row_index * 104 + 34), label, font=font, fill=(94, 74, 80))
        for direction in range(16):
            gaze_row = 9 if direction < 8 else 10
            gaze_column = direction % 8
            frame = sheet.crop((gaze_column * 192, gaze_row * 208, (gaze_column + 1) * 192, (gaze_row + 1) * 208))
            checker = Image.new("RGBA", frame.size, (251, 246, 247, 255))
            checker.alpha_composite(frame)
            checker.thumbnail((thumb_w - 4, thumb_h - 4), Image.Resampling.LANCZOS)
            x = margin + direction * thumb_w + (thumb_w - checker.width) // 2
            y = row_index * 104 + 8 + (thumb_h - checker.height) // 2
            preview.paste(checker.convert("RGB"), (x, y))
            if row_index == 0:
                draw.text((x + thumb_w // 2 - 6, row_index * 104 + 90), str(direction), font=font, fill=(130, 109, 114))

    output = ROOT / "artifacts" / "wardrobe-directions-review.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    preview.save(output, optimize=True)
    print(f"Wardrobe assets checked: {checked} variants; all preserve the source alpha channel.")
    print(f"16-direction review: {output}")


if __name__ == "__main__":
    main()
