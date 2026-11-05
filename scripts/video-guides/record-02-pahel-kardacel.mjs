// Իրական UI-ի նկարահանում. CDP screencast + սեղմումների ժամանակները
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2]; const DEBUG = process.argv[3] === 'debug';
mkdirSync(OUT + '/raw', { recursive: true });
const BASE = 'http://127.0.0.1:5174';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'hy-AM', timezoneId: 'Asia/Yerevan' });
await c.addInitScript(() => { try { sessionStorage.setItem('library-loader-seen-v4', '1'); localStorage.setItem('install-prompt-dismissed','1'); } catch {} });
const p = await c.newPage();
// տաքացում՝ vite-ը առաջին անգամ դանդաղ է
for (const u of ['/pray', '/pray/90211', '/saved', '/saved?tab=reading']) { await p.goto(BASE + u, { waitUntil: 'networkidle' }); }
await p.goto(BASE + '/pray', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
await p.evaluate(() => localStorage.removeItem('corner-tab'));
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
async function smoothScrollTo(y, ms = 900) {
  await p.evaluate(async ([y, ms]) => { const s = scrollY, d = y - s, t0 = performance.now(); await new Promise(r => { const f = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; scrollTo(0, s + d * e); k < 1 ? requestAnimationFrame(f) : r(); }; requestAnimationFrame(f); }); }, [y, ms]);
}
const wait = (ms) => p.waitForTimeout(ms);
await wait(1200);
// 1. բացել նյութը
mark('open'); await wait(900);
await tap(p.getByText('Տերունական աղոթք', { exact: true }).first(), 'material');
await p.waitForURL('**/pray/90211'); await wait(1400); await dbg('material');
// 2. Պահել
const save = p.getByRole('button', { name: 'Պահել Իմ անկյունում' });
const saveBox = await p.locator('button.read-mark').boundingBox();
mark('save'); await smoothScrollTo(Math.max(0, (await p.evaluate(() => scrollY)) + saveBox.y - 470)); await wait(700);
await tap(save, 'save'); await p.getByRole('button', { name: 'Հեռացնել Իմ անկյունից' }).waitFor(); await wait(1500); await dbg('saved');
// 3. Կարդացել եմ
mark('read'); await wait(600);
await tap(p.locator('button.read-mark'), 'read'); await p.getByText('Այսօր կարդացել եք').waitFor(); await wait(1700); await dbg('read');
// 4. Իմ անկյունը
mark('corner'); await wait(500);
await tap(p.getByRole('button', { name: 'Բացել մենյուն' }), 'menu'); await wait(900); await dbg('menu');
await tap(p.locator('a[href="/saved"]').filter({ hasText: 'Իմ անկյունը' }).first(), 'corner');
await p.waitForURL('**/saved'); await wait(1200);
await smoothScrollTo(300, 900); await wait(700);
await tap(p.locator('summary').filter({ hasText: 'պահված նյութ' }).first(), 'group'); await wait(1800); await dbg('corner');
// 5. Օրացույց
mark('calendar'); await wait(400);
await tap(p.getByRole('tab', { name: /ընթերցանությունը/ }), 'tab'); await wait(1200);
const todayNum = String(new Date().getDate());
const cal = p.locator('button[aria-pressed]').filter({ hasText: new RegExp('^' + todayNum + '$') }).first();
const cb = await cal.boundingBox(); await smoothScrollTo((await p.evaluate(() => scrollY)) + cb.y - 380, 1000); await wait(900); await dbg('calendar');
mark('done'); await wait(3800); await dbg('done');
await cdp.send('Page.stopScreencast');
await wait(300);
writeFileSync(OUT + '/timeline.json', JSON.stringify({ frames, events }, null, 1));
console.log('frames', frames.length, 'dur', (frames.at(-1).t - frames[0].t).toFixed(1));
await b.close();
