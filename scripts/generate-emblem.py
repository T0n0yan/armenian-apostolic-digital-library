"""Generates the emblem (design/logo/emblem-*.svg): Christ the King's crown of thorns around the
Cross as the Tree of Life — an Armenian cross whose foot is a rooted trunk, growing branches,
leaves and pomegranates. Re-run after tweaking: python3 scripts/generate-emblem.py
"""

import math
import pathlib
import random

ROOT = pathlib.Path(__file__).resolve().parent.parent / "design" / "logo"
C = 512
rng = random.Random(17)


def strand(radius, amplitude, waves, phase, wobble):
    points = []
    for index in range(901):
        t = 2 * math.pi * index / 900
        r = radius + amplitude * math.sin(waves * t + phase) + wobble * math.sin(3 * t + phase * 2)
        points.append((C + r * math.cos(t), C + r * math.sin(t)))
    return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in points) + " Z"


def thorns(radius, count, color):
    shapes = []
    for index in range(count):
        t = 2 * math.pi * (index + rng.uniform(-0.25, 0.25)) / count
        outward = index % 2 == 0
        base = radius + (16 if outward else -16)
        length = rng.uniform(22, 34) * (1 if outward else -0.8)
        lean = rng.uniform(-0.18, 0.18)
        cx, cy = C + base * math.cos(t), C + base * math.sin(t)
        tip = (C + (base + length) * math.cos(t + lean * 0.08), C + (base + length) * math.sin(t + lean * 0.08))
        nx, ny = -math.sin(t), math.cos(t)
        half = 6
        shapes.append(f'<path d="M{cx + nx * half:.1f} {cy + ny * half:.1f} L{tip[0]:.1f} {tip[1]:.1f} L{cx - nx * half:.1f} {cy - ny * half:.1f} Z"/>')
    return f'<g fill="{color}">{"".join(shapes)}</g>'


def crown(color, shade):
    strands = "".join(
        f'<path d="{strand(436, 15, 9, phase, 4)}" stroke="{color}" stroke-width="13"/>'
        f'<path d="{strand(436, 15, 9, phase, 4)}" stroke="{shade}" stroke-width="3" opacity=".55"/>'
        for phase in (0, 2 * math.pi / 3, 4 * math.pi / 3)
    )
    return f'<g fill="none" stroke-linecap="round">{strands}</g>' + thorns(436, 44, color)


def arm(length, inner=21, outer=42, bud=19):
    return (
        f'<path d="M-{inner} 0 L-{outer} {-length + bud} Q0 {-length + bud + 20} {outer} {-length + bud} L{inner} 0 Z"/>'
        f'<circle cx="-{outer - 3}" cy="{-length + bud}" r="{bud}"/><circle cx="{outer - 3}" cy="{-length + bud}" r="{bud}"/>'
    )


def pomegranate(x, y, size, color, seed, page):
    """A pomegranate split open, showing its seeds (many seeds, one fruit: the faithful, one Church)."""
    s = size
    seeds = "".join(
        f'<circle cx="{dx * s:.1f}" cy="{dy * s:.1f}" r="{s * 0.11:.1f}" fill="{color}"/>'
        for dx, dy in ((-0.22, -0.05), (0.0, -0.12), (0.22, -0.05), (-0.12, 0.14), (0.12, 0.14), (0.0, 0.32))
    )
    return (
        f'<g transform="translate({x} {y})">'
        f'<circle r="{s}" fill="{color}"/>'
        f'<path d="M-{s * 0.4} {-s * 0.84} L-{s * 0.52} {-s * 1.3} L-{s * 0.18} {-s * 1.04} L0 {-s * 1.42} L{s * 0.18} {-s * 1.04} L{s * 0.52} {-s * 1.3} L{s * 0.4} {-s * 0.84} Z" fill="{color}"/>'
        f'<path d="M-{s * 0.52} {-s * 0.18} Q0 {-s * 0.5} {s * 0.52} {-s * 0.18} Q{s * 0.5} {s * 0.5} 0 {s * 0.62} Q-{s * 0.5} {s * 0.5} -{s * 0.52} {-s * 0.18} Z" fill="{page}"/>'
        f"{seeds}</g>"
    )


def leaf(x, y, rotation, color, size=1.0):
    return f'<path d="M0 0 C10 -12 30 -12 40 0 C30 12 10 12 0 0 Z" transform="translate({x} {y}) rotate({rotation}) scale({size})" fill="{color}"/>'


def tree_cross(color, seed, page):
    cx, cy = C, 452
    branch = lambda d: f'<path d="{d}" fill="none" stroke="{color}" stroke-width="14" stroke-linecap="round"/>'
    parts = [
        # Branches first, so the cross sits on top of them.
        branch(f"M{cx} 640 C{cx - 60} 620 {cx - 120} 600 {cx - 160} 548"),
        branch(f"M{cx} 640 C{cx + 60} 620 {cx + 120} 600 {cx + 160} 548"),
        branch(f"M{cx} 700 C{cx - 50} 690 {cx - 96} 690 {cx - 128} 664"),
        branch(f"M{cx} 700 C{cx + 50} 690 {cx + 96} 690 {cx + 128} 664"),
        branch(f"M{cx} 330 C{cx - 40} 320 {cx - 84} 300 {cx - 104} 262"),
        branch(f"M{cx} 330 C{cx + 40} 320 {cx + 84} 300 {cx + 104} 262"),
        leaf(cx - 96, 612, 200, color), leaf(cx + 96, 612, -20, color),
        leaf(cx - 136, 572, 240, color, 0.9), leaf(cx + 136, 572, -60, color, 0.9),
        leaf(cx - 40, 628, 150, color, 0.75), leaf(cx + 40, 628, 30, color, 0.75),
        leaf(cx - 100, 676, 120, color, 0.7), leaf(cx + 100, 676, 60, color, 0.7),
        leaf(cx - 84, 292, 250, color, 0.75), leaf(cx + 84, 292, -70, color, 0.75),
        leaf(cx - 70, 694, 170, color, 0.8), leaf(cx + 70, 694, 10, color, 0.8),
        leaf(cx - 56, 316, 210, color, 0.8), leaf(cx + 56, 316, -30, color, 0.8),
        f'<g fill="{color}" transform="translate({cx} {cy})">'
        f'<g>{arm(184)}</g><g transform="rotate(90)">{arm(152)}</g><g transform="rotate(-90)">{arm(152)}</g>'
        # The lower arm is a trunk that widens and roots into the ground.
        '<path d="M-21 0 L-32 300 L32 300 L21 0 Z"/><circle r="34"/></g>',
        f'<g fill="none" stroke="{color}" stroke-width="10" stroke-linecap="round">'
        f'<path d="M{cx - 14} 748 C{cx - 40} 768 {cx - 80} 774 {cx - 116} 770"/>'
        f'<path d="M{cx + 14} 748 C{cx + 40} 768 {cx + 80} 774 {cx + 116} 770"/>'
        f'<path d="M{cx - 6} 752 C{cx - 18} 778 {cx - 40} 790 {cx - 60} 796"/>'
        f'<path d="M{cx + 6} 752 C{cx + 18} 778 {cx + 40} 790 {cx + 60} 796"/></g>',
        f'<circle cx="{cx}" cy="{cy}" r="14" fill="{page}"/>',
        pomegranate(cx - 172, 548, 38, color, seed, page), pomegranate(cx + 172, 548, 38, color, seed, page),
        pomegranate(cx - 140, 668, 31, color, seed, page), pomegranate(cx + 140, 668, 31, color, seed, page),
        pomegranate(cx - 114, 256, 31, color, seed, page), pomegranate(cx + 114, 256, 31, color, seed, page),
    ]
    return "".join(parts)


def emblem(gold, shade, background, page, ring=True):
    inner = tree_cross(gold, shade, page)
    body = f'<rect width="1024" height="1024" fill="{background}"/>'
    if ring:
        body += crown(gold, shade)
        inner = f'<g transform="translate({C} {C}) scale(.98) translate(-{C} -{C + 14})">{inner}</g>'
    else:
        inner = f'<g transform="translate({C} {C}) scale(1.16) translate(-{C} -{C + 14})">{inner}</g>'
    return body + inner


DEFS = """<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dcb260"/><stop offset="1" stop-color="#a6772b"/></linearGradient>
<linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4d998"/><stop offset="1" stop-color="#c79d52"/></linearGradient>
<radialGradient id="p" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#fbf4e3"/><stop offset="1" stop-color="#ebd9b0"/></radialGradient>
<radialGradient id="d" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#43195a"/><stop offset="1" stop-color="#170a1f"/></radialGradient></defs>"""


def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">{DEFS}{body}</svg>'


ROOT.mkdir(parents=True, exist_ok=True)
(ROOT / "emblem-parchment.svg").write_text(svg(emblem("url(#g)", "#6e4a16", "url(#p)", "#f8eed8")))
(ROOT / "emblem-dark.svg").write_text(svg(emblem("url(#gd)", "#5a3a10", "url(#d)", "#2a1037")))
(ROOT / "emblem-icon.svg").write_text(svg(emblem("url(#gd)", "#5a3a10", "url(#d)", "#2a1037", ring=False)))
print("ok")
