# Թեմայի վիդեոյի սկզբի կադրերում հեռախոսի ներքևի անկյունները կլորացնել
import sys, subprocess, numpy as np
src, dst, f0, f1, good_n = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
W, H, RI, RO, STATIC_FROM = 1080, 1920, 60, 80, 37
def frames():
    p = subprocess.Popen(["ffmpeg","-v","error","-i",src,"-f","rawvideo","-pix_fmt","rgb24","-"], stdout=subprocess.PIPE)
    while True:
        b = p.stdout.read(W*H*3)
        if len(b) < W*H*3: return
        yield np.frombuffer(b, np.uint8).reshape(H, W, 3).copy()
good = next(f for i, f in enumerate(frames()) if i == good_n).astype(float)
enc = subprocess.Popen(["ffmpeg","-v","error","-y","-f","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r","30","-i","-",
  "-c:v","libx264","-preset","slow","-crf","14","-pix_fmt","yuv420p","-movflags","+faststart","-an",dst], stdin=subprocess.PIPE)
def geom(fr):
    L = fr.mean(2)
    c = L[1820:1919, 540]; mn = c.min()
    band = np.nonzero(c < mn + 0.5*(c[:20].mean() - mn))[0] + 1820
    r = L[1700, 150:540]; mr = r.min()
    lb = np.nonzero(r < mr + 0.5*(r[:30].mean() - mr))[0] + 150
    return band.min()-1, band.max(), lb.max()+1, lb.min()   # ներքին ներքև, արտաքին ներքև, ներքին ձախ, արտաքին ձախ
S = 90  # անկյունի քառակուսու չափը
for n, fr in enumerate(frames()):
    if f0 <= n <= f1:
        B, Bo, Lx, Lo = geom(fr)
        bezel = fr[(B+1+Bo)//2, 540].astype(float)
        for side in (0, 1):
            x0 = Lo - 2 if side == 0 else W - (Lo - 2) - S
            y0 = B - S + 15
            yy, xx = np.mgrid[y0:y0+S, x0:x0+S].astype(float) + 0.5
            mx = np.minimum(xx, W - xx)            # հայելային՝ ձախ անկյան կոորդինատներ
            def outside(left, bottom, R):
                cx, cy = left + R, bottom - R
                dx = np.maximum(cx - mx, 0); dy = np.maximum(yy - cy, 0)
                return np.clip(np.hypot(dx, dy) - R + 0.5, 0, 1) * ((mx < cx) & (yy > cy))
            a_in = outside(Lx, B + 1, RI)            # ներքին կլորից դուրս
            reg = fr[y0:y0+S, x0:x0+S].astype(float)
            if n >= STATIC_FROM:
                tgt = good[y0:y0+S, x0:x0+S]
            else:
                a_out = outside(Lo, Bo + 1, RO)
                bg = fr[B + 20, Lo - 6 if side == 0 else W - Lo + 5].astype(float)
                tgt = bezel*(1 - a_out[..., None]) + bg*a_out[..., None]
            # միայն այնտեղ, որտեղ էկրանի քառակուսի անկյունը դուրս է գալիս
            sq = ((mx >= Lx) & (yy <= B + 1)).astype(float)
            a = (a_in * sq)[..., None]
            fr[y0:y0+S, x0:x0+S] = (reg*(1-a) + tgt*a).round().astype(np.uint8)
    enc.stdin.write(fr.tobytes())
enc.stdin.close(); enc.wait(); print("ok")
