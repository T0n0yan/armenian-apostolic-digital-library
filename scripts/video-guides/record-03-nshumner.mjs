// Իրական UI-ի նկարահանում. CDP screencast + սեղմումների ժամանակները
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2]; const DEBUG = process.argv[3] === 'debug';
mkdirSync(OUT + '/raw', { recursive: true });
const BASE = 'http://127.0.0.1:5174';
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
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
// Նախադասության կենտրոնը (տեքստով)՝ էկրանի կոորդինատներով
async function textPoint(needle) {
  return p.evaluate((needle) => {
    const root = document.querySelector('.reading-body'); const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) { const i = n.data.indexOf(needle); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + needle.length); const b = r.getClientRects()[0]; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; } }
    return null;
  }, needle);
}
async function tapAt(pt, label) { events.push({ type: 'tap', label, x: pt.x, y: pt.y, t: now() }); await p.touchscreen.tap(pt.x, pt.y); }
// 1. բացել նյութը
mark('open'); await wait(700);
await tap(p.getByText('Տերունական աղոթք', { exact: true }).first(), 'material');
await p.waitForURL('**/pray/90211'); await wait(1300);
// 2. սեղմել նախադասության վրա
mark('pick'); await wait(500);
await tapAt(await textPoint('հանապազորդ'), 'sentence'); await wait(550);
// 3. Պահել (պատուհանը 1 վրկ հետո փոքրանում է)
mark('save');
await tap(p.getByRole('toolbar', { name: 'Նշել ընտրվածը' }).getByRole('button', { name: /Պահել/ }), 'save'); await wait(1900); await dbg('saved');
// 4. սեղմել դեղին տողի վրա → նշման քարտ
mark('open-note'); await wait(400);
await tapAt(await textPoint('հանապազորդ'), 'line'); await wait(1200); await dbg('sheet');
mark('emoji'); await wait(300);
await tap(p.getByRole('button', { name: '🙏', exact: true }).first(), 'emoji'); await wait(800);
const area = p.locator('textarea').first();
await tap(area, 'note'); await wait(300);
await area.pressSequentially('Ամեն օր ասել առավոտյան', { delay: 75 }); await wait(500); await dbg('typed');
await tap(p.getByRole('button', { name: /^\s*Պահել\s*$/ }).last(), 'note-save'); await wait(1400); await dbg('note-saved');
await tap(p.getByRole('button', { name: 'Փակել' }).last(), 'close'); await wait(1000);
// 5. Իմ նշումները
mark('notes'); await wait(400);
await tap(p.getByRole('button', { name: 'Բացել մենյուն' }), 'menu'); await wait(900);
await tap(p.locator('a[href="/saved"]').filter({ hasText: 'Իմ անկյունը' }).first(), 'corner');
await p.waitForURL('**/saved'); await wait(1100);
await smoothScrollTo(300, 900); await wait(500);
await tap(p.getByRole('tab', { name: /նշումները/ }), 'tab'); await wait(1300); await dbg('notes');
const card = p.getByText('հանապազորդ', { exact: false }).first();
const cb = await card.boundingBox(); if (cb && cb.y > 600) { await smoothScrollTo((await p.evaluate(() => scrollY)) + cb.y - 420, 900); }
await wait(600);
mark('done'); await wait(3600); await dbg('done');
await cdp.send('Page.stopScreencast');
await wait(300);
writeFileSync(OUT + '/timeline.json', JSON.stringify({ frames, events }, null, 1));
console.log('frames', frames.length, 'dur', (frames.at(-1).t - frames[0].t).toFixed(1));
await b.close();
