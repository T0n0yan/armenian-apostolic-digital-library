#!/usr/bin/env python3
"""Bird-letter (Trchnatar) initials for the prayer link-preview cards.

The card engines (Satori, resvg) draw a colour font's letters in plain black, so each Armenian
capital is written out once as an SVG of its coloured layers (COLR/CPAL), which the cards then
show as a picture: app/assets/og-initials/<code point>.svg. Run after changing the font:

    python3 scripts/build-bird-initials.py
"""
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
font = TTFont(ROOT / "app/assets/fonts/Trchnatar.woff2")
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
layers = font["COLR"].ColorLayers
palette = font["CPAL"].palettes[0]
out = ROOT / "app/assets/og-initials"
out.mkdir(exist_ok=True)

for code in range(ord("Ա"), ord("Ֆ") + 1):
    name = cmap.get(code)
    if not name:
        continue
    parts = layers.get(name) or []
    if not parts:
        continue
    bounds = BoundsPen(glyphs)
    for part in parts:
        glyphs[part.name].draw(bounds)
    if not bounds.bounds:
        continue
    x0, y0, x1, y1 = bounds.bounds
    pad = 8
    paths = []
    for part in parts:
        pen = SVGPathPen(glyphs)
        # Font units go up; SVG goes down.
        glyphs[part.name].draw(TransformPen(pen, (1, 0, 0, -1, -x0 + pad, y1 + pad)))
        color = palette[part.colorID] if part.colorID != 0xFFFF else None
        fill = f"#{color.red:02x}{color.green:02x}{color.blue:02x}" if color else "#3a2412"
        opacity = f' fill-opacity="{color.alpha / 255:.3f}"' if color and color.alpha < 255 else ""
        paths.append(f'<path fill="{fill}"{opacity} d="{pen.getCommands()}"/>')
    width, height = x1 - x0 + 2 * pad, y1 - y0 + 2 * pad
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} {height:.0f}" width="{width:.0f}" height="{height:.0f}">{"".join(paths)}</svg>\n'
    (out / f"{code:x}.svg").write_text(svg)
print(f"wrote {len(list(out.glob('*.svg')))} initials to {out.relative_to(ROOT)}")
