"""Generates the "Tree of Life" logo (design/logo/*.svg): a flowering Armenian cross on an open
Gospel, vine scrolls from its foot (khachkar tree of life), framed by an Armenian interlace band.
Re-run after tweaking: python3 scripts/generate-logo.py
"""

import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / "design" / "logo"
C = 512


def braid(radius, amplitude, waves, phase):
    points = []
    for index in range(721):
        t = 2 * math.pi * index / 720
        r = radius + amplitude * math.sin(waves * t + phase)
        points.append((C + r * math.cos(t), C + r * math.sin(t)))
    return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in points) + " Z"


def arm(length, inner=17, outer=36, bud=17):
    """One arm pointing up from the center: widens toward its end, which splits into two buds."""
    return (
        f'<path d="M-{inner} 0 L-{outer} {-length + bud} Q0 {-length + bud + 22} {outer} {-length + bud} L{inner} 0 Z"/>'
        f'<circle cx="-{outer - 3}" cy="{-length + bud}" r="{bud}"/><circle cx="{outer - 3}" cy="{-length + bud}" r="{bud}"/>'
    )


def cross(cx, cy):
    return (
        f'<g transform="translate({cx} {cy})">'
        f'<g>{arm(176)}</g><g transform="rotate(90)">{arm(150)}</g><g transform="rotate(-90)">{arm(150)}</g>'
        '<path d="M-17 0 L-24 230 L24 230 L17 0 Z"/><circle r="30"/></g>'
    )


def scroll(cx, y, side):
    s = side
    return (
        f"M{cx + 6 * s} {y} C{cx + 60 * s} {y} {cx + 120 * s} {y - 30} {cx + 118 * s} {y - 86} "
        f"C{cx + 116 * s} {y - 128} {cx + 66 * s} {y - 136} {cx + 58 * s} {y - 100} "
        f"C{cx + 52 * s} {y - 74} {cx + 82 * s} {y - 66} {cx + 88 * s} {y - 84}"
    )


def tendrils(cx, y, color):
    def leaf(x, ly, rotation):
        return f'<path d="M0 0 C12 -14 34 -14 46 0 C34 14 12 14 0 0 Z" transform="translate({x} {ly}) rotate({rotation})"/>'

    return (
        f'<g fill="none" stroke="{color}" stroke-width="11" stroke-linecap="round"><path d="{scroll(cx, y, -1)}"/><path d="{scroll(cx, y, 1)}"/></g>'
        f'<g fill="{color}">{leaf(cx - 150, y - 40, 200)}{leaf(cx + 150, y - 40, -20)}{leaf(cx - 96, y - 10, 160)}{leaf(cx + 96, y - 10, 20)}</g>'
    )


def book(cx, top, color, page):
    def side(s):
        return (
            f"M{cx + 10 * s} {top} Q{cx + 120 * s} {top - 40} {cx + 232 * s} {top - 28} "
            f"L{cx + 232 * s} {top + 92} Q{cx + 120 * s} {top + 80} {cx + 10 * s} {top + 120} Z"
        )

    lines = "".join(
        f'<path d="M{cx - 200} {top + y} Q{cx - 110} {top + y - 18} {cx - 36} {top + y + 14}"/>'
        f'<path d="M{cx + 200} {top + y} Q{cx + 110} {top + y - 18} {cx + 36} {top + y + 14}"/>'
        for y in (12, 40, 68)
    )
    return (
        f'<g stroke="{color}" stroke-width="11" stroke-linejoin="round" fill="{page}"><path d="{side(-1)}"/><path d="{side(1)}"/></g>'
        f'<g fill="none" stroke="{color}" stroke-width="5" stroke-linecap="round" opacity=".55">{lines}</g>'
        f'<path d="M{cx - 250} {top + 112} Q{cx - 120} {top + 102} {cx} {top + 138} Q{cx + 120} {top + 102} {cx + 250} {top + 112}" '
        f'fill="none" stroke="{color}" stroke-width="7" stroke-linecap="round" opacity=".8"/>'
    )


def mark(gold, background, page, ring=True):
    inner = book(C, 640, gold, page) + tendrils(C, 640, gold) + f'<g fill="{gold}">{cross(C, 420)}</g>'
    body = f'<rect width="1024" height="1024" fill="{background}"/>'
    if ring:
        body += (
            f'<circle cx="{C}" cy="{C}" r="478" fill="none" stroke="{gold}" stroke-width="5"/>'
            f'<circle cx="{C}" cy="{C}" r="408" fill="none" stroke="{gold}" stroke-width="5"/>'
            f'<g fill="none" stroke="{gold}" stroke-width="9"><path d="{braid(443, 17, 36, 0)}"/><path d="{braid(443, 17, 36, math.pi)}"/></g>'
        )
        inner = f'<g transform="translate({C} {C + 6}) scale(.9) translate(-{C} -{C})">{inner}</g>'
    else:
        inner = f'<g transform="translate({C} {C + 34}) scale(1.14) translate(-{C} -{C})">{inner}</g>'
    return body + inner


DEFS = """<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8ad5c"/><stop offset="1" stop-color="#a87a2e"/></linearGradient>
<linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d798"/><stop offset="1" stop-color="#c9a056"/></linearGradient>
<radialGradient id="p" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#fbf4e3"/><stop offset="1" stop-color="#eddcb6"/></radialGradient>
<radialGradient id="d" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#43195a"/><stop offset="1" stop-color="#170a1f"/></radialGradient></defs>"""


def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">{DEFS}{body}</svg>'


ROOT.mkdir(parents=True, exist_ok=True)
(ROOT / "tree-of-life-parchment.svg").write_text(svg(mark("url(#g)", "url(#p)", "#fbf3e1")))
(ROOT / "tree-of-life-dark.svg").write_text(svg(mark("url(#gd)", "url(#d)", "#2e1340")))
(ROOT / "tree-of-life-icon.svg").write_text(svg(mark("url(#gd)", "url(#d)", "#2e1340", ring=False)))
print("ok")
