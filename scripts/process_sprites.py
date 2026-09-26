from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from rembg import new_session, remove
from scipy.ndimage import distance_transform_edt


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".local-assets" / "source" / "pet-actions.png"
OUTPUT = ROOT / "public" / "assets" / "sprites"

POSES = {
    "idle": (20, 0, 350, 540),
    "blink": (400, 0, 735, 540),
    "walk-left": (775, 0, 1145, 540),
    "walk-right": (1140, 0, 1536, 540),
    "sit": (5, 540, 360, 1024),
    "sleep": (330, 540, 835, 1024),
    "happy": (785, 540, 1145, 1024),
    "drag": (1175, 540, 1536, 1024),
}


def fit_on_canvas(image: Image.Image, size: int = 512) -> Image.Image:
    alpha_box = image.getchannel("A").getbbox()
    if alpha_box is None:
        raise RuntimeError("Background removal produced an empty sprite")

    sprite = image.crop(alpha_box)
    max_width = size - 24
    max_height = size - 18
    scale = min(1.0, max_width / sprite.width, max_height / sprite.height)
    if scale < 1.0:
        sprite = sprite.resize(
            (round(sprite.width * scale), round(sprite.height * scale)),
            Image.Resampling.LANCZOS,
        )

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - sprite.width) // 2
    y = size - sprite.height - 6
    canvas.alpha_composite(sprite, (x, y))
    return canvas


def decontaminate_edges(image: Image.Image) -> Image.Image:
    pixels = np.array(image)
    alpha = pixels[:, :, 3]
    opaque = alpha >= 245
    if not opaque.any():
        return image

    _, nearest = distance_transform_edt(~opaque, return_indices=True)
    edge = (alpha > 0) & (alpha < 245)
    pixels[edge, :3] = pixels[nearest[0][edge], nearest[1][edge], :3]
    return Image.fromarray(pixels, "RGBA")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SOURCE).convert("RGBA")
    session = new_session("u2netp")

    for name, box in POSES.items():
        crop = sheet.crop(box)
        isolated = remove(
            crop,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=230,
            alpha_matting_background_threshold=18,
            alpha_matting_erode_size=8,
        )
        cleaned_alpha = (
            isolated.getchannel("A")
            .filter(ImageFilter.MinFilter(5))
            .filter(ImageFilter.GaussianBlur(0.55))
        )
        isolated.putalpha(cleaned_alpha)
        isolated = decontaminate_edges(isolated)
        sprite = fit_on_canvas(isolated)
        destination = OUTPUT / f"{name}.png"
        sprite.save(destination, optimize=True)
        print(f"{name}: {destination} ({destination.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
