import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


EXPECTED = {
    0: ("idle", 7), 1: ("run_right", 8), 2: ("run_left", 8),
    3: ("wave", 4), 4: ("jump", 5), 5: ("fail", 8),
    6: ("waiting", 6), 7: ("run", 6), 8: ("review", 6),
    9: ("gaze_000_to_157_5", 8), 10: ("gaze_180_to_337_5", 8),
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--atlas", type=Path, required=True)
    args = parser.parse_args()
    atlas_path = args.atlas.resolve()
    with Image.open(atlas_path) as source:
        image = source.convert("RGBA")
    width, height = image.size
    columns, rows = 8, 11
    cell_width, cell_height = width // columns, height // rows
    diagnostics = []
    row_results = []
    for row in range(rows):
        name, expected_nonempty = EXPECTED[row]
        frames = []
        for column in range(columns):
            cell = image.crop((column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height))
            alpha = cell.getchannel("A")
            nonempty = alpha.getbbox() is not None
            digest = hashlib.sha256(cell.tobytes()).hexdigest() if nonempty else None
            alpha_pixels = sum(1 for value in alpha.getdata() if value > 8)
            edge_pixels = 0
            for x in range(cell_width):
                edge_pixels += alpha.getpixel((x, 0)) > 8
                edge_pixels += alpha.getpixel((x, cell_height - 1)) > 8
            for y in range(1, cell_height - 1):
                edge_pixels += alpha.getpixel((0, y)) > 8
                edge_pixels += alpha.getpixel((cell_width - 1, y)) > 8
            frames.append({
                "column": column,
                "nonempty": nonempty,
                "alpha_pixels": alpha_pixels,
                "edge_alpha_pixels": edge_pixels,
                "sha256_cell": digest,
            })
        actual_nonempty = sum(frame["nonempty"] for frame in frames)
        unique_frames = len({frame["sha256_cell"] for frame in frames if frame["sha256_cell"]})
        row_results.append({
            "row": row,
            "name": name,
            "nonempty_frames": actual_nonempty,
            "unique_nonempty_frames": unique_frames,
            "expected_nonempty_frames": expected_nonempty,
            "frames": frames,
        })
        if actual_nonempty != expected_nonempty:
            diagnostics.append(f"row {row} {name}: expected {expected_nonempty} nonempty cells, got {actual_nonempty}")
        for frame in frames:
            if frame["edge_alpha_pixels"]:
                diagnostics.append(f"row {row} column {frame['column']}: {frame['edge_alpha_pixels']} opaque edge pixels; inspect cell boundary")
    if (width, height) != (1536, 2288):
        diagnostics.append(f"atlas dimensions are {width}x{height}, expected 1536x2288")
    if image.mode != "RGBA":
        diagnostics.append(f"atlas mode is {image.mode}, expected RGBA")

    report = {
        "atlas": str(atlas_path),
        "sha256": sha256(atlas_path),
        "format": Image.open(atlas_path).format,
        "mode": image.mode,
        "width": width,
        "height": height,
        "columns": columns,
        "rows": rows,
        "cell_width": cell_width,
        "cell_height": cell_height,
        "alpha_extrema": image.getchannel("A").getextrema(),
        "transparent_pixels": sum(1 for value in image.getchannel("A").getdata() if value == 0),
        "row_results": row_results,
        "diagnostics": diagnostics,
        "passed": not diagnostics,
    }
    artifacts = args.project / "artifacts"
    artifacts.mkdir(parents=True, exist_ok=True)
    (artifacts / "action-atlas-qa.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    tile_width, tile_height, label_height = 120, 132, 28
    sheet = Image.new("RGB", (columns * tile_width, rows * (tile_height + label_height)), "#faf4f5")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("msyh.ttc", 13)
    except OSError:
        font = ImageFont.load_default()
    for row, row_result in enumerate(row_results):
        for column, frame in enumerate(row_result["frames"]):
            cell = image.crop((column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height))
            cell.thumbnail((tile_width - 10, tile_height - 6), Image.Resampling.LANCZOS)
            x = column * tile_width + (tile_width - cell.width) // 2
            y = row * (tile_height + label_height) + (tile_height - cell.height) // 2
            sheet.paste(cell, (x, y), cell)
            if row >= 9:
                label = f"{column + (row - 9) * 8}: {row_result['name']}"
            else:
                label = f"{row_result['name']} · {column + 1}"
            draw.text((column * tile_width + 4, row * (tile_height + label_height) + tile_height + 3), label, fill="#604e52", font=font)
    sheet.save(artifacts / "action-atlas-qa.png")
    print(json.dumps({key: report[key] for key in ("sha256", "width", "height", "columns", "rows", "cell_width", "cell_height", "passed", "diagnostics")}, ensure_ascii=False))
    if diagnostics:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
