import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    with Image.open(args.input) as source:
        normalized = source.convert("RGBA")
    if normalized.size != (1536, 2288):
        raise SystemExit(f"Expected a 1536x2288 atlas, received {normalized.width}x{normalized.height}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    normalized.save(args.output, format="PNG", optimize=True)
    print(f"Normalized transparent atlas to {args.output}")


if __name__ == "__main__":
    main()
