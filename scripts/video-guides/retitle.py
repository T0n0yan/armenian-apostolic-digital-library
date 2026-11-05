# Հին (ChatGPT) վիդեոյի վերնագիրը փոխել նորով, ամեն կադրում պահելով հին տառերի գույնը (բաց/մուգ ֆոն, ներածության մարում)։
# Գործարկում՝ python3 retitle.py in.mp4 out.mp4 mask_dark.png mask_gold.png
# Դիմակները՝ 1080×160 (վիդեոյի 92–251 տողերը), սպիտակ տեքստ սև ֆոնին։ Հին վերնագիրը՝ x 216–864, y 112–189 (01-tema)։
import sys, subprocess, numpy as np
from PIL import Image
src, dst, mdark, mgold = sys.argv[1:5]
W, H, Y0 = 1080, 1920, 92
TOP, BOT = 95, 247                     # ֆոնի «հենարան» տողերը (վերնագրից վեր և ներքև)
OLD_DARK = (slice(112, 190), slice(216, 640))
OLD_GOLD = (slice(112, 190), slice(690, 865))
RULE_SRC, RULE_DST = 205, 236           # տակի գիծը՝ 31px ներքև
a_dark = np.asarray(Image.open(mdark).convert('L')).astype(float)[..., None] / 255
a_gold = np.asarray(Image.open(mgold).convert('L')).astype(float)[..., None] / 255

def ink(frame, bg, region):
    # հին տառերի գույնը՝ ֆոնից ամենահեռու կետը (մարման ժամանակ ինքն էլ թույլ է)
    f = frame[region].reshape(-1, 3); g = bg[region].reshape(-1, 3)
    d = np.abs(f - g).sum(1); m = d.max()
    if m <= 18: return None
    return f[d >= 0.8 * m].mean(0)            # ամենավառ կետերի միջինը, ոչ թե մեկ կետ

KER = np.ones(21) / 21
def smooth(row):
    pad = np.pad(row, ((10, 10), (0, 0)), mode='edge')
    return np.stack([np.convolve(pad[:, c], KER, mode='valid') for c in range(3)], 1)

dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '30', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', dst], stdin=subprocess.PIPE)
k = (np.arange(TOP, BOT + 1) - TOP)[:, None, None] / (BOT - TOP)
n = 0
while True:
    buf = dec.stdout.read(W * H * 3)
    if len(buf) < W * H * 3: break
    fr = np.frombuffer(buf, np.uint8).reshape(H, W, 3).astype(float)
    bg = fr.copy()
    top, bot = smooth(fr[TOP - 4:TOP + 1].mean(0)), smooth(fr[BOT:BOT + 5].mean(0))
    bg[TOP:BOT + 1] = top[None] * (1 - k) + bot[None] * k   # սյունակ առ սյունակ գծային ֆոն (հարթեցված, առանց գծերի)
    c_dark, c_gold = ink(fr, bg, OLD_DARK), ink(fr, bg, OLD_GOLD)
    rule = fr[RULE_SRC:RULE_SRC + 8].copy() - bg[RULE_SRC:RULE_SRC + 8]   # գիծը որպես տարբերություն ֆոնից
    out = bg
    out[RULE_DST:RULE_DST + 8] += rule
    reg = out[Y0:Y0 + 160]
    if c_dark is not None: reg[:] = reg * (1 - a_dark) + c_dark * a_dark
    if c_gold is not None: reg[:] = reg * (1 - a_gold) + c_gold * a_gold
    enc.stdin.write(np.clip(out, 0, 255).round().astype(np.uint8).tobytes()); n += 1
enc.stdin.close(); enc.wait(); print('frames', n)
