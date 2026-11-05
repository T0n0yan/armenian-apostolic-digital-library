// Կոմպոզիցիա. իրական նկարահանում + վերնագիր, քայլեր, սեղմման նշան → MP4
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const [CAP, PLANFILE, OUTMP4, ONLY] = process.argv.slice(2);
const tl = JSON.parse(readFileSync(CAP + '/timeline.json', 'utf8'));
const spec = JSON.parse(readFileSync(PLANFILE, 'utf8'));
const FPS = 30, INTRO = spec.intro ?? 0.9, TAIL = spec.tail ?? 0.4;
const r0 = tl.frames[0].t, toOut = (t) => t - r0 + INTRO;
const stepAt = Object.fromEntries(tl.events.filter(e => e.type === 'step').map(e => [e.name, toOut(e.t)]));
const steps = spec.steps.map(s => ({ ...s, t: s.at === 'start' ? INTRO * 0.6 : stepAt[s.at] + (s.offset ?? 0) }));
const plan = { title: spec.title, steps, doneT: steps.find(s => s.done).t, taps: tl.events.filter(e => e.type === 'tap').map(e => ({ ...e, t: toOut(e.t) })), drags: tl.events.filter(e => e.type === 'drag').map(e => ({ ...e, t: toOut(e.t), t1: toOut(e.t1) })) };
const dur = toOut(tl.frames.at(-1).t) + TAIL, N = Math.round(dur * FPS);
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const p = await (await b.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })).newPage();
await p.goto('file://' + new URL('./stage.html', import.meta.url).pathname); await p.evaluate(() => document.fonts.ready);
await p.evaluate((pl) => window.setup(pl), plan);
const frameAt = (t) => { const r = t - INTRO + r0; let lo = 0; for (let i = 0; i < tl.frames.length && tl.frames[i].t <= r; i++) lo = i; return 'file://' + CAP + '/' + tl.frames[lo].file; };
const list = ONLY ? ONLY.split(',').map(Number) : null;
const ff = list ? null : spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', OUTMP4], { stdio: ['pipe', 'inherit', 'inherit'] });
const ts = list ?? Array.from({ length: N }, (_, i) => i / FPS);
for (const [k, t] of ts.entries()) {
  await p.evaluate(([t, u]) => window.render(t, u), [t, frameAt(t)]);
  const buf = await p.screenshot(list ? { type: 'png' } : { type: 'jpeg', quality: 95 });
  if (list) { (await import('node:fs')).writeFileSync(`${OUTMP4}_${String(t).replace('.', '_')}.png`, buf); }
  else if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (!list && k % 150 === 0) console.log('frame', k, '/', N);
}
if (ff) { ff.stdin.end(); await new Promise(r => ff.on('close', r)); }
console.log('done', N, 'frames', dur.toFixed(1), 's'); await b.close();
