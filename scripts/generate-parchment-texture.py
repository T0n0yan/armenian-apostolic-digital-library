"""Generates app/assets/parchment-creases.webp: a crumpled-paper shading map.

Crumpled paper is many straight folds with flat facets between them. The height field is a sum of
random folds h += a * |n . p - d| (each fold is a straight crease), plus faint fiber noise. It is
lit from the upper left and stored as a neutral gray map that the page multiplies over the
parchment color. Re-run to tweak: python3 scripts/generate-parchment-texture.py
"""

import math
import pathlib

import numpy as np
from PIL import Image

WIDTH, HEIGHT = 720, 1280
rng = np.random.default_rng(1744)
y, x = np.mgrid[0:HEIGHT, 0:WIDTH].astype(np.float32)
x /= WIDTH
y /= WIDTH  # same scale on both axes

# A gentle low-frequency warp bends the otherwise perfectly straight creases.
warp = rng.normal(0, 1, (12, 7)).astype(np.float32)
warp_x = np.array(Image.fromarray(warp).resize((WIDTH, HEIGHT), Image.BICUBIC)) * 0.012
warp = rng.normal(0, 1, (12, 7)).astype(np.float32)
warp_y = np.array(Image.fromarray(warp).resize((WIDTH, HEIGHT), Image.BICUBIC)) * 0.012
wx, wy = x + warp_x, y + warp_y

height = np.zeros((HEIGHT, WIDTH), np.float32)
# Large folds first, then progressively smaller, shorter and weaker creases.
for count, strength, length in ((16, 0.022, (0.5, 1.2)), (55, 0.009, (0.18, 0.5)), (150, 0.0032, (0.06, 0.22))):
    for _ in range(count):
        angle = rng.uniform(0, math.pi)
        nx, ny = math.cos(angle), math.sin(angle)
        cx, cy = rng.uniform(-0.1, 1.1), rng.uniform(-0.1, HEIGHT / WIDTH + 0.1)
        d = nx * cx + ny * cy
        sign = 1 if rng.random() < 0.5 else -1
        fold = np.abs(nx * wx + ny * wy - d)
        reach = rng.uniform(0.12, 0.5)
        # A crease has a finite length along its own direction and fades out at both ends.
        along = -ny * (wx - cx) + nx * (wy - cy)
        window = np.exp(-(along / rng.uniform(*length)) ** 2)
        height += sign * strength * np.minimum(fold, reach) * window

def shading(field: np.ndarray, scale: float) -> np.ndarray:
    """Lambert shading from the upper left, normalized to zero mean and unit spread."""
    gy, gx = np.gradient(field)
    normal = np.stack([-gx * scale, -gy * scale, np.ones_like(field)])
    normal /= np.linalg.norm(normal, axis=0)
    light = np.array([-0.55, -0.6, 0.58], np.float32)
    light /= np.linalg.norm(light)
    shade = np.tensordot(light, normal, axes=1)
    return (shade - shade.mean()) / (shade.std() + 1e-6)


# Fine paper fibers, shaded separately so they add grain without hiding the folds.
fibers = rng.normal(0, 1, (HEIGHT // 3, WIDTH // 3)).astype(np.float32)
fibers = np.array(Image.fromarray(fibers).resize((WIDTH, HEIGHT), Image.BICUBIC))

shade = 0.92 * shading(height, 6000.0) + 0.12 * shading(fibers, 0.6)

# Creases as a translucent sepia layer (darkness -> alpha), so the page can stack it over the paper
# color with plain alpha blending. A blend mode such as multiply would be re-composited on every
# scroll frame and make phones stutter.
darkness = np.clip(-shade * 0.05 + 0.02, 0.0, 0.2)
alpha = (darkness / 0.2 * 70).astype(np.uint8)
rgba = np.zeros((HEIGHT, WIDTH, 4), np.uint8)
rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3] = 92, 62, 26, alpha
out = pathlib.Path(__file__).resolve().parent.parent / "app" / "assets" / "parchment-creases.webp"
Image.fromarray(rgba).save(out, "WEBP", quality=60, alpha_quality=45, method=6)
print(out, out.stat().st_size // 1024, "KB")
