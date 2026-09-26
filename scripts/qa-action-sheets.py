import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


EXPECTED = {
    "heart-gesture-v1.png": "比心",
    "shy-gesture-v1.png": "害羞",
    "celebrate-gesture-v1.png": "庆祝",
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def inspect_sheet(path, label):
    diagnostics = []
    with Image.open(path) as source:
        original_mode = source.mode
        image = source.convert("RGBA")
        image_format = source.format
    if image.size != (1536, 1024):
        diagnostics.append(f"{path.name}: dimensions are {image.size[0]}x{image.size[1]}, expected 1536x1024")
    if original_mode != "RGBA":
        diagnostics.append(f"{path.name}: mode is {original_mode}, expected RGBA")
    alpha = image.getchannel("A")
    if alpha.getextrema()[0] != 0:
        diagnostics.append(f"{path.name}: alpha has no fully transparent pixels")

    frames = []
    hashes = set()
    for row in range(2):
        for column in range(4):
            cell = image.crop((column * 384, row * 512, (column + 1) * 384, (row + 1) * 512))
            cell_alpha = cell.getchannel("A")
            nonempty = cell_alpha.getbbox() is not None
            digest = hashlib.sha256(cell.tobytes()).hexdigest() if nonempty else None
            if digest:
                hashes.add(digest)
            edge_pixels = 0
            for x in range(384):
                edge_pixels += cell_alpha.getpixel((x, 0)) > 16
                edge_pixels += cell_alpha.getpixel((x, 511)) > 16
            for y in range(1, 511):
                edge_pixels += cell_alpha.getpixel((0, y)) > 16
                edge_pixels += cell_alpha.getpixel((383, y)) > 16
            frame = {"index": row * 4 + column, "nonempty": nonempty, "edge_alpha_pixels_above_16": edge_pixels, "sha256_cell": digest}
            frames.append(frame)
            if not nonempty:
                diagnostics.append(f"{path.name}: frame {frame['index']} is empty")
            if edge_pixels:
                diagnostics.append(f"{path.name}: frame {frame['index']} has {edge_pixels} visible edge pixels")
    if len(hashes) != 8:
        diagnostics.append(f"{path.name}: only {len(hashes)} unique frames; expected 8")
    return {
        "file": path.name,
        "label": label,
        "sha256": sha256(path),
        "format": image_format,
        "mode": original_mode,
        "width": image.width,
        "height": image.height,
        "columns": 4,
        "rows": 2,
        "cell_width": 384,
        "cell_height": 512,
        "alpha_extrema": alpha.getextrema(),
        "unique_frames": len(hashes),
        "frames": frames,
        "diagnostics": diagnostics,
        "passed": not diagnostics,
    }, image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", type=Path, required=True)
    args = parser.parse_args()
    asset_dir = args.project / "public" / "assets" / "actions"
    results = []
    images = []
    diagnostics = []
    for filename, label in EXPECTED.items():
        path = asset_dir / filename
        if not path.is_file():
            diagnostics.append(f"missing action sheet: {path}")
            continue
        result, image = inspect_sheet(path, label)
        results.append(result)
        images.append((label, image))
        diagnostics.extend(result["diagnostics"])

    report = {"sheets": results, "diagnostics": diagnostics, "passed": not diagnostics}
    artifacts = args.project / "artifacts"
    artifacts.mkdir(parents=True, exist_ok=True)
    (artifacts / "action-sheets-qa.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    tile_width, tile_height, label_height = 120, 160, 26
    contact = Image.new("RGB", (4 * tile_width, len(images) * 2 * (tile_height + label_height)), "#faf4f5")
    draw = ImageDraw.Draw(contact)
    try:
        font = ImageFont.truetype("msyh.ttc", 13)
    except OSError:
        font = ImageFont.load_default()
    for action_index, (label, image) in enumerate(images):
        for frame in range(8):
            row, column = divmod(frame, 4)
            cell = image.crop((column * 384, row * 512, (column + 1) * 384, (row + 1) * 512))
            cell.thumbnail((tile_width - 10, tile_height - 8), Image.Resampling.LANCZOS)
            x = column * tile_width + (tile_width - cell.width) // 2
            contact_row = action_index * 2 + row
            y = contact_row * (tile_height + label_height) + (tile_height - cell.height) // 2
            contact.paste(cell, (x, y), cell)
            draw.text((column * tile_width + 4, contact_row * (tile_height + label_height) + tile_height + 4), f"{label} · {frame + 1}", fill="#604e52", font=font)
    contact.save(artifacts / "action-sheets-qa.png")
    print(json.dumps({"passed": report["passed"], "sheets": [{"file": sheet["file"], "sha256": sheet["sha256"], "unique_frames": sheet["unique_frames"]} for sheet in results], "diagnostics": diagnostics}, ensure_ascii=False))
    if diagnostics:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
