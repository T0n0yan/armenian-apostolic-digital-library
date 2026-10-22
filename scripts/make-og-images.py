"""Builds the link-preview pictures (Open Graph, 1200x630) for sections whose materials have no
picture of their own: the section's art, darkened, with its name in gold. Run from the repo root:
python3 scripts/make-og-images.py  (needs Pillow, fontTools, brotli)."""
import io
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1200, 630
SECTIONS = {
    "psalms": ("psalms.webp", "Սաղմոսներ"),
    "prayers": ("prayers.webp", "Աղոթքներ"),
    "bible-questions": ("bible-questions.webp", "Հարցեր Աստվածաշնչից"),
    "gospel-teachings": ("gospel-teaching.webp", "Ավետարանի ուսուցում"),
    "saints-lives": ("saints-lives.webp", "Սրբերի վարքը"),
    "daily-readings": ("daily-readings.webp", "Օրվա ընթերցումներ"),
}


def font(name, size):
    data = io.BytesIO()
    woff = TTFont(f"app/assets/fonts/{name}")
    woff.flavor = None
    woff.save(data)
    data.seek(0)
    return ImageFont.truetype(data, size)


def cover(image):
    scale = max(W / image.width, H / image.height)
    image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    left, top = (image.width - W) // 2, (image.height - H) // 2
    return image.crop((left, top, left + W, top + H))


title_font = font("NotoSerifArmenian-SemiBold.woff2", 84)
site_font = font("NotoSerifArmenian-Medium.woff2", 34)
gold, soft = (240, 211, 151), (222, 205, 180)
for slug, (art, title) in SECTIONS.items():
    # The art has soft transparent edges: lay it on the site's dark plum, then dim it under the text.
    art_image = Image.open(f"app/assets/{art}").convert("RGBA")
    backdrop = Image.new("RGBA", art_image.size, (20, 10, 24, 255))
    backdrop.alpha_composite(art_image)
    base = cover(backdrop.convert("RGB")).filter(ImageFilter.GaussianBlur(3))
    image = Image.blend(base, Image.new("RGB", (W, H), (20, 10, 24)), 0.62)
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse((W / 2 - 470, H / 2 - 170, W / 2 + 470, H / 2 + 170), fill=150)
    image = Image.composite(Image.new("RGB", (W, H), (16, 8, 20)), image, glow.filter(ImageFilter.GaussianBlur(70)))
    draw = ImageDraw.Draw(image)
    draw.rectangle((36, 36, W - 37, H - 37), outline=(217, 181, 111), width=2)
    draw.text((W / 2, H / 2 - 30), title, font=title_font, fill=gold, anchor="mm")
    draw.line((W / 2 - 150, H / 2 + 40, W / 2 + 150, H / 2 + 40), fill=(217, 181, 111), width=2)
    draw.text((W / 2, H / 2 + 100), "Հոգևոր ժառանգություն · apostolic.am", font=site_font, fill=soft, anchor="mm")
    image.save(f"public/og/{slug}.jpg", quality=86, optimize=True, progressive=True)
    print(slug)
