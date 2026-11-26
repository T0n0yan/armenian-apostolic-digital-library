"""Թռչնատառ տառատեսակը (250 KB) բաժանում է ըստ տառի (~9 KB), որ բրաուզերը բեռնի միայն պետք եղածը։
Աշխատեցնել՝ pip install fonttools brotli && python3 scripts/split-trchnatar.py
Գրում է app/assets/fonts/trchnatar/*.woff2 և app/trchnatar-faces.css-ը։"""
import subprocess
from fontTools.ttLib import TTFont

SOURCE = "app/assets/fonts/Trchnatar.woff2"
cmap = TTFont(SOURCE).getBestCmap()
rules = ["/* Ստեղծված է scripts/split-trchnatar.py-ով, ձեռքով չփոխել։ */"]
for upper in range(0x0531, 0x0557):
    codes = [c for c in (upper, upper + 0x30) if c in cmap]
    if not codes:
        continue
    name = f"{upper:04X}"
    subprocess.run(["pyftsubset", SOURCE, "--unicodes=" + ",".join(f"U+{c:04X}" for c in codes), "--flavor=woff2",
                    f"--output-file=app/assets/fonts/trchnatar/{name}.woff2"], check=True)
    rules.append('@font-face { font-family: "Trchnatar Birds Color"; src: url("./assets/fonts/trchnatar/%s.woff2") format("woff2"); font-display: block; unicode-range: %s; }'
                 % (name, ", ".join(f"U+{c:04X}" for c in codes)))
open("app/trchnatar-faces.css", "w").write("\n".join(rules) + "\n")
