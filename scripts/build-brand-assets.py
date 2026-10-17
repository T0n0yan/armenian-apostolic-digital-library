"""Builds the brand assets from the golden dove (design/logo/dove/source.webp).

1. Cut the dove out of its paper background (gold is saturated, paper and shadow are not).
2. Bot avatars (parchment and dark), favicons, touch icons and the in-app mark.
Re-run after replacing the source: python3 scripts/build-brand-assets.py
"""

import pathlib

import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "design" / "logo" / "dove" / "source.webp"
OUT = ROOT / "design" / "logo" / "dove"
PUBLIC = ROOT / "public"
ASSETS = ROOT / "app" / "assets"


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


def cut_out(image: Image.Image) -> Image.Image:
    rgb = np.asarray(image.convert("RGB")).astype(np.float32) / 255
    high, low = rgb.max(axis=2), rgb.min(axis=2)
    saturation = np.where(high > 0, (high - low) / np.maximum(high, 1e-6), 0)
    # Gold: saturated and not near-white. Paper (and its soft gray shadow) is almost unsaturated.
    alpha = smoothstep(0.13, 0.26, saturation)
    mask = Image.fromarray((alpha * 255).astype(np.uint8))
    # Close pinholes inside the bird (bright highlights), then soften the edge by a pixel.
    mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    # Pull the edge in by a pixel so no paper-colored fringe remains, then soften it.
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    cut = image.convert("RGBA")
    # Edge pixels are part paper: replace their color with the nearby gold so dark backgrounds show
    # no light halo.
    solid = np.asarray(mask) > 235
    pixels = np.asarray(cut).copy()
    gold = Image.fromarray(np.where(solid[..., None], pixels[..., :3], 0).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    weight = Image.fromarray((solid * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    edge = (np.asarray(mask) <= 235) & (np.asarray(weight) > 0)
    pixels[edge, :3] = np.asarray(gold)[edge]
    cut = Image.fromarray(pixels)
    cut.putalpha(mask)
    box = mask.point(lambda value: 255 if value > 24 else 0).getbbox()
    return cut.crop(box)


def compose(dove: Image.Image, size: int, background: str, scale: float, circle_safe: bool) -> Image.Image:
    canvas = Image.new("RGBA", (size, size))
    if background == "parchment":
        gradient = np.zeros((size, size, 4), np.uint8)
        y, x = np.mgrid[0:size, 0:size]
        distance = np.sqrt(((x - size / 2) / size) ** 2 + ((y - size * 0.44) / size) ** 2)
        top, bottom = np.array([251, 244, 228]), np.array([233, 214, 174])
        mix = np.clip(distance / 0.72, 0, 1)[..., None]
        gradient[..., :3] = (top * (1 - mix) + bottom * mix).astype(np.uint8)
        gradient[..., 3] = 255
        canvas = Image.fromarray(gradient)
    elif background == "dark":
        gradient = np.zeros((size, size, 4), np.uint8)
        y, x = np.mgrid[0:size, 0:size]
        distance = np.sqrt(((x - size / 2) / size) ** 2 + ((y - size * 0.4) / size) ** 2)
        top, bottom = np.array([67, 25, 90]), np.array([23, 10, 31])
        mix = np.clip(distance / 0.72, 0, 1)[..., None]
        gradient[..., :3] = (top * (1 - mix) + bottom * mix).astype(np.uint8)
        gradient[..., 3] = 255
        canvas = Image.fromarray(gradient)
    # Telegram crops avatars to a circle, so keep the bird inside its inscribed circle.
    limit = size * scale * (0.86 if circle_safe else 1.0)
    ratio = min(limit / dove.width, limit / dove.height)
    bird = dove.resize((round(dove.width * ratio), round(dove.height * ratio)), Image.LANCZOS)
    offset = ((size - bird.width) // 2 + round(size * 0.01), (size - bird.height) // 2)
    canvas.alpha_composite(bird, offset)
    return canvas


def main():
    dove = cut_out(Image.open(SOURCE))
    dove.save(OUT / "dove-transparent.png", optimize=True)

    compose(dove, 1024, "parchment", 0.78, True).convert("RGB").save(OUT / "bot-avatar-parchment.png", optimize=True)
    compose(dove, 1024, "dark", 0.78, True).convert("RGB").save(OUT / "bot-avatar-dark.png", optimize=True)

    # Browser and home-screen icons: parchment tile, bird slightly larger (no circle crop).
    icon = compose(dove, 512, "parchment", 0.84, False)
    icon.save(PUBLIC / "icon-512.png", optimize=True)
    icon.resize((192, 192), Image.LANCZOS).save(PUBLIC / "icon-192.png", optimize=True)
    icon.resize((180, 180), Image.LANCZOS).convert("RGB").save(PUBLIC / "apple-touch-icon.png", optimize=True)
    # The favicon is the bird alone so it stays legible on light and dark browser tabs.
    small = compose(dove, 256, "none", 0.98, False)
    small.save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    small.resize((64, 64), Image.LANCZOS).save(PUBLIC / "favicon-64.png", optimize=True)

    # In-app mark (menu button): transparent, 192 px tall is plenty for a 25–60 px element.
    mark_height = 192
    dove.resize((round(dove.width * mark_height / dove.height), mark_height), Image.LANCZOS).save(ASSETS / "dove-mark.png", optimize=True)
    print("ok")


main()
