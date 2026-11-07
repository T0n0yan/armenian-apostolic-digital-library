#!/usr/bin/env python3
"""Story-ի ֆոները՝ PNG → WebP.

    python3 scripts/make-story-backgrounds.py <PNG-ների թղթապանակ>

Ամեն նկար դառնում է 1080×1920 WebP (public/story-bg/NN.webp) և փոքր պատկեր ընտրության համար
(public/story-bg/thumbs/NN.webp). Գրվում է app/utils/story-backgrounds.generated.ts-ը՝ ամեն ֆոնի
պայծառությամբ (մուգ ֆոնին տառերը բաց են)։ Հին ֆայլերը փոխարինվում են։
"""

import sys
from pathlib import Path

from PIL import Image, ImageOps, ImageStat

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "story-bg"
THUMBS = OUT / "thumbs"
MANIFEST = ROOT / "app" / "utils" / "story-backgrounds.generated.ts"
SIZE = (1080, 1920)
THUMB = (216, 384)


def tone(image: Image.Image) -> str:
    # Տեքստը գտնվում է մոտավորապես 15%–82% բարձրության վրա։
    width, height = image.size
    area = image.crop((0, int(height * 0.15), width, int(height * 0.82))).convert("L")
    return "dark" if ImageStat.Stat(area).mean[0] < 140 else "light"


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    source = Path(sys.argv[1])
    files = sorted(p for p in source.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"})
    if not files:
        sys.exit(f"{source}-ում նկար չկա")
    THUMBS.mkdir(parents=True, exist_ok=True)
    for old in list(OUT.glob("*.webp")) + list(THUMBS.glob("*.webp")):
        old.unlink()
    entries = []
    for number, path in enumerate(files, start=1):
        identifier = f"{number:02d}"
        image = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        image = ImageOps.fit(image, SIZE, Image.LANCZOS)
        image.save(OUT / f"{identifier}.webp", "WEBP", quality=82, method=6)
        image.resize(THUMB, Image.LANCZOS).save(THUMBS / f"{identifier}.webp", "WEBP", quality=70, method=6)
        entries.append((identifier, tone(image)))
        size = (OUT / f"{identifier}.webp").stat().st_size // 1024
        print(f"{path.name} → {identifier}.webp ({size} ԿԲ, {entries[-1][1]})")
    lines = ",\n".join(f'  {{ id: "{i}", tone: "{t}" }}' for i, t in entries)
    MANIFEST.write_text(
        "// Ստեղծվում է `python3 scripts/make-story-backgrounds.py`-ով. ձեռքով չխմբագրել։\n"
        "// tone՝ ֆոնի պայծառությունը տեքստի տեղում (մուգ ֆոնին՝ բաց տառեր)։\n"
        f'export const STORY_IMAGES: {{ id: string; tone: "dark" | "light" }}[] = [\n{lines},\n];\n',
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
