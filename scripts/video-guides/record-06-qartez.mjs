// Իրական UI-ի նկարահանում. CDP screencast + սեղմումների ժամանակները
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2]; const DEBUG = process.argv[3] === 'debug';
mkdirSync(OUT + '/raw', { recursive: true });
const BASE = 'http://127.0.0.1:5174';
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'hy-AM', timezoneId: 'Asia/Yerevan' });
await c.addInitScript(() => {
  // Ադմինի կոճակները սովորական մարդը չի տեսնում. վիդեոյում էլ՝ ոչ
  document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'a[href^="/admin"]{display:none!important}'; document.head.appendChild(s); });
  try { sessionStorage.setItem('library-loader-seen-v4', '1'); localStorage.setItem('install-prompt-dismissed','1'); } catch {} });
const p = await c.newPage();
// տաքացում՝ vite-ը առաջին անգամ դանդաղ է
for (const u of ['/', '/places', '/places/mayr-ator-surb-ejmiatsin']) { await p.goto(BASE + u, { waitUntil: 'networkidle' }); }
await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
await p.evaluate(() => { localStorage.removeItem('places-view'); });
const frames = []; const events = []; let n = 0;
const cdp = await c.newCDPSession(p);
cdp.on('Page.screencastFrame', async (f) => { const name = `raw/${String(n++).padStart(5, '0')}.jpg`; writeFileSync(OUT + '/' + name, Buffer.from(f.data, 'base64')); frames.push({ t: f.metadata.timestamp, file: name }); await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 });
const now = () => Date.now() / 1000;
const mark = (name) => events.push({ type: 'step', name, t: now() });
let shot = 0;
const dbg = async (n) => { if (DEBUG) await p.screenshot({ path: `${OUT}/dbg_${shot++}_${n}.png` }); };
async function tap(loc, label) {
  await loc.scrollIntoViewIfNeeded();
  const bx = await loc.boundingBox();
  const x = bx.x + bx.width / 2, y = bx.y + bx.height / 2;
  events.push({ type: 'tap', label, x, y, t: now() });
  await p.touchscreen.tap(x, y);
}
async function tapAt(pt, label) { events.push({ type: 'tap', label, x: pt.x, y: pt.y, t: now() }); await p.touchscreen.tap(pt.x, pt.y); }
async function smoothScrollTo(y, ms = 900) {
  await p.evaluate(async ([y, ms]) => { const s = scrollY, d = y - s, t0 = performance.now(); await new Promise(r => { const f = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; scrollTo(0, s + d * e); k < 1 ? requestAnimationFrame(f) : r(); }; requestAnimationFrame(f); }); }, [y, ms]);
}
const scrollToEl = async (loc, top, ms) => { const b = await loc.boundingBox(); await smoothScrollTo((await p.evaluate(() => scrollY)) + b.y - top, ms); };
const wait = (ms) => p.waitForTimeout(ms);
// Քարտեզի կարմիր կետը (նշանը)՝ էկրանի կոորդինատներով
async function pinPoint() {
  const cb = await p.locator('canvas.maplibregl-canvas').first().boundingBox();
  const png = (await p.screenshot({ clip: cb })).toString('base64');
  return p.evaluate(async ([x, y, w, h, png]) => { const im = new Image(); im.src = 'data:image/png;base64,' + png; await im.decode(); const o = document.createElement('canvas'); o.width = im.width; o.height = im.height; const g = o.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, o.width, o.height).data; let sx = 0, sy = 0, n = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] > 170 && d[i + 1] < 90 && d[i + 2] < 90) { const k = i / 4; sx += k % o.width; sy += Math.floor(k / o.width); n++; } } return n ? { x: x + sx / n * w / o.width, y: y + sy / n * h / o.height } : null; }, [cb.x, cb.y, cb.width, cb.height, png]);
}
await wait(1200);
// 1. Սրբավայրեր
mark('open'); await wait(600);
await tap(p.getByRole('button', { name: 'Բացել մենյուն' }), 'menu'); await wait(900);
await dbg('menu');
await tap(p.locator('[role=dialog] a[href="/places"], nav a[href="/places"]').filter({ visible: true }).first(), 'places');
await p.waitForURL('**/places', { waitUntil: 'commit' }); await wait(2200); await dbg('places');
// 2. քարտեզը
mark('map'); await wait(300);
await scrollToEl(p.locator('canvas.maplibregl-canvas').first(), 250, 900); await wait(700);
await tap(p.getByRole('button', { name: 'Մոտեցնել' }), 'zoom'); await wait(1300);
// 3. նշանը
mark('pin'); await wait(500);
await tapAt(await pinPoint(), 'pin'); await wait(1800); await dbg('card');
// 4. Եղել եմ
mark('visit'); await wait(400);
await tap(p.getByRole('button', { name: /Նշել, որ եղել եմ/ }).first(), 'visit'); await wait(1800); await dbg('visited');
// 5. Մանրամասն
mark('details'); await wait(300);
await tap(p.getByRole('link', { name: /Մանրամասն/ }).first(), 'details');
await p.waitForURL('**/places/mayr-ator-surb-ejmiatsin', { waitUntil: 'commit' }); await wait(2200); await dbg('page');
await scrollToEl(p.getByRole('heading', { name: 'Պատմություն' }), 150, 1400); await wait(1800);
await scrollToEl(p.getByRole('heading', { name: 'Այցելություն' }), 150, 1300); await wait(2000); await dbg('access');
// 6. Ինչպես հասնել
mark('route'); await wait(200);
await scrollToEl(p.getByRole('heading', { name: 'Ինչպես հասնել' }), 120, 1100); await wait(3200); await dbg('route');
mark('done'); await wait(3400); await dbg('done');
await cdp.send('Page.stopScreencast');
await wait(300);
writeFileSync(OUT + '/timeline.json', JSON.stringify({ frames, events }, null, 1));
console.log('frames', frames.length, 'dur', (frames.at(-1).t - frames[0].t).toFixed(1));
await b.close();
