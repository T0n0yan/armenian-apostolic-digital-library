# Հին (ChatGPT) վիդեոյի հեռախոսի էկրանին բառը փոխել. ամեն կադրում գտնում է հին տեքստը (OpenCV template matching,
# մի քանի մասշտաբով, բաց/մուգ), ջնջում է այն քարտի ֆոնով և գրում նորը նույն գույնով, չափով ու տեղով։
# Գործարկում՝ python3 replace-phone-text.py in.mp4 out.mp4 ref_title.png ref_menu.png fonts_dir
# 01-tema-ի համար. «Թեմա» (կարգավորումների քարտ) → «Կայքի լուսավորություն», մենյուի կետը՝ 2 տողով։
import sys, subprocess, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
src, dst, ref_title, ref_menu, fonts = sys.argv[1:6]
W, H, P, SS = 1080, 1920, 4, 3          # P՝ կաղապարի եզր, SS՝ տեքստի գերնմուշառում
FONT = lambda w, s, sub='armenian': ImageFont.truetype(f'{fonts}/noto-sans-armenian-{sub}-{w}-normal.woff2', s * SS)
ARM = lambda ch: '\u0531' <= ch <= '\u058f'

def draw_runs(draw, xy, text, weight, size):
    # հայերեն տառերը՝ armenian ֆայլով, բացատ/կետադրություն՝ latin ֆայլով (մեկ ֆայլում երկուսը չկան)
    fa, fl = FONT(weight, size), FONT(weight, size, 'latin'); x, y = xy; i = 0
    while i < len(text):
        arm = ARM(text[i]); j = i
        while j < len(text) and ARM(text[j]) == arm: j += 1
        f = fa if arm else fl; draw.text((x, y), text[i:j], font=f, fill=255); x += f.getlength(text[i:j]); i = j

def text_mask(lines, weight, size, pitch):
    # սպիտակ տեքստ, ձախ-վերևի «թանաքը» (0,0)-ում, բազային (1.0) մասշտաբով, գերնմուշառված
    f = FONT(weight, size); im = Image.new('L', (1200 * SS, (pitch * len(lines) + 40) * SS), 0); d = ImageDraw.Draw(im)
    tops = []
    for i, t in enumerate(lines):
        tmp = Image.new('L', im.size, 0); draw_runs(ImageDraw.Draw(tmp), (20 * SS, 10 * SS), t, weight, size)
        a = np.asarray(tmp); ys, xs = np.nonzero(a > 60); tops.append((xs.min(), ys.min()))
        im.paste(255, (20 * SS - xs.min(), 10 * SS - ys.min() + i * pitch * SS), tmp)   # ամեն տող՝ իր թանաքի վերևով
    a = np.asarray(im).astype(np.float32) / 255
    ys, xs = np.nonzero(a > 0.02)
    return a[10 * SS: ys.max() + 1, 20 * SS: xs.max() + 1]          # թանաքի ձախ-վերևը՝ (0,0)

TARGETS = [
    dict(name='title', ref=ref_title, box=(379, 759, 451, 779), thr=0.72, zone=(640, 900),
         mask=text_mask(['Կայքի լուսավորություն'], '600', 25, 0), erase=(-5, -5, 0, 26)),
    dict(name='menu', ref=ref_menu, box=(371, 1544, 574, 1597), thr=0.62, zone=(1470, 1680),
         mask=text_mask(['Կայքի լուսավորություն,', 'տառաչափ, տառատեսակ…'], '400', 21, 32), erase=(-5, -5, 0, 58)),
]
for t in TARGETS:
    g = cv2.imread(t['ref'], 0); x0, y0, x1, y1 = t['box']
    t['tpl'] = g[y0 - P:y1 + P, x0 - P:x1 + P]
    mh, mw = t['mask'].shape; t['tw'] = int(np.ceil(mw / SS))
SCALES = [1.0, 0.98, 0.96, 0.95, 0.94, 0.93, 0.92, 0.9]

def locate(gray, t):
    best = (0, None, 1.0, 0)
    for s in SCALES:
        tpl = t['tpl'] if s == 1.0 else cv2.resize(t['tpl'], None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        for inv in (0, 1):
            r = cv2.minMaxLoc(cv2.matchTemplate(255 - gray if inv else gray, tpl, cv2.TM_CCOEFF_NORMED))
            if r[1] > best[0]: best = (r[1], r[3], s, inv)
    return best

def apply(fr, t, loc, s):
    x0, y0, x1, y1 = t['box']
    ox, oy = loc[0] + P * s, loc[1] + P * s                         # հին թանաքի ձախ-վերևը
    ow, oh = (x1 - x0) * s, (y1 - y0) * s
    ex0, ey0 = int(ox + t['erase'][0] * s), int(oy + t['erase'][1] * s)
    ex1 = int(ox + max(x1 - x0, t['tw']) * s + 8 * s); ey1 = int(oy + t['erase'][3] * s)
    # հին տեքստի գույնը՝ ամենահակադրվող կետերի միջին
    old = fr[int(oy):int(oy + oh) + 1, int(ox):int(ox + ow) + 1].astype(np.float32)
    ref = np.median(fr[int(oy):int(oy + oh) + 1, ex1 + 4:ex1 + int(18 * s)].reshape(-1, 3).astype(np.float32), 0)
    d = np.abs(old - ref).sum(2); col = old[d >= 0.8 * d.max()].mean(0)
    # ջնջել՝ ամեն տող լցնել աջ կողմի ֆոնով (քարտի գույնը)
    bgcol = np.median(fr[ey0:ey1, ex1 + 4:ex1 + int(18 * s)].astype(np.float32), 1)
    fr[ey0:ey1, ex0:ex1] = bgcol[:, None, :].round().astype(np.uint8)
    # նոր տեքստը
    m = cv2.resize(t['mask'], None, fx=s / SS, fy=s / SS, interpolation=cv2.INTER_AREA)
    px, py = int(round(ox)), int(round(oy)); h, w = m.shape
    reg = fr[py:py + h, px:px + w].astype(np.float32); a = m[: reg.shape[0], : reg.shape[1], None]
    fr[py:py + h, px:px + w] = (reg * (1 - a) + col * a).round().astype(np.uint8)

dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', '30', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', dst], stdin=subprocess.PIPE)
n = 0; log = []
while True:
    buf = dec.stdout.read(W * H * 3)
    if len(buf) < W * H * 3: break
    fr = np.frombuffer(buf, np.uint8).reshape(H, W, 3).copy()
    gray = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
    for t in TARGETS:
        z0, z1 = t['zone']                                   # միայն իր գոտում (կեղծ համընկնումներից խուսափել)
        sc, loc, s, inv = locate(gray[z0:z1, 150:950], t)
        if sc >= t['thr']:
            apply(fr, t, (loc[0] + 150, loc[1] + z0), s); log.append((n, t['name'], round(sc, 2), s))
    enc.stdin.write(fr.tobytes()); n += 1
enc.stdin.close(); enc.wait()
import collections; c = collections.Counter(x[1] for x in log); print('frames', n, dict(c))
print('title frames', [x[0] for x in log if x[1] == 'title'][:3], '…', [x[0] for x in log if x[1] == 'title'][-3:])
print('menu frames', [x[0] for x in log if x[1] == 'menu'][:3], '…', [x[0] for x in log if x[1] == 'menu'][-3:])
