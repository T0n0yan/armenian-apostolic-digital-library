#!/usr/bin/env python3
"""Story-ի ֆոները՝ PNG/WebP/JPEG → 1080×1920 WebP.

    python3 -I scripts/make-story-backgrounds.py <թղթապանակ>

Ֆայլերի անունները՝ `<ձևավորում>-dark` և `<ձևավորում>-light` (օր.՝ `dome-dark.png`)։
Գրվում են public/story-bg/<անուն>.webp և փոքր պատկերը public/story-bg/thumbs/<անուն>.webp։
Նոր ձևավորումը պետք է ավելացնել նաև app/utils/story-backgrounds.ts-ում (տեքստի տեղով)։
"""

import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "story-bg"
THUMBS = OUT / "thumbs"
SIZE = (1080, 1920)
THUMB = (144, 256)


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    files = sorted(p for p in Path(sys.argv[1]).iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"})
    if not files:
        sys.exit("Նկար չկա")
    THUMBS.mkdir(parents=True, exist_ok=True)
    for path in files:
        if not re.fullmatch(r"[a-z0-9]+-(dark|light)", path.stem):
            sys.exit(f"{path.name}. անունը պետք է լինի <ձևավորում>-dark կամ <ձևավորում>-light")
        image = ImageOps.fit(ImageOps.exif_transpose(Image.open(path)).convert("RGB"), SIZE, Image.LANCZOS)
        target = OUT / f"{path.stem}.webp"
        image.save(target, "WEBP", quality=86, method=6)
        image.resize(THUMB, Image.LANCZOS).save(THUMBS / f"{path.stem}.webp", "WEBP", quality=72, method=6)
        print(f"{path.name} → {target.name} ({target.stat().st_size // 1024} ԿԲ)")


if __name__ == "__main__":
    main()
