// Ընդհանուր գործիքներ նկարահանման համար. հեռախոսի չափս, CDP screencast, սեղմումներ, սահուն թերթում
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

export async function startRecorder({ out, base = 'http://127.0.0.1:5174', debug = false, warm = [], start = '/', init, permissions = [], geolocation }) {
  mkdirSync(out + '/raw', { recursive: true });
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...(geolocation ? { geolocation } : {}), locale: 'hy-AM', timezoneId: 'Asia/Yerevan',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
  await c.addInitScript(() => {
    // Ադմինի կոճակները սովորական մարդը չի տեսնում. վիդեոյում էլ՝ ոչ
    document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'a[href^="/admin"]{display:none!important}'; document.head.appendChild(s); });
    try { sessionStorage.setItem('library-loader-seen-v4', '1'); } catch {}
  });
  if (init) await c.addInitScript(init);
  if (permissions.length) await c.grantPermissions(permissions, { origin: base });
  const p = await c.newPage();
  for (const u of warm) await p.goto(base + u, { waitUntil: 'networkidle' }).catch(() => {});
  await p.goto(base + start, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const frames = [], events = []; let n = 0, shot = 0;
  const cdp = await c.newCDPSession(p);
  cdp.on('Page.screencastFrame', async (f) => { const name = `raw/${String(n++).padStart(5, '0')}.jpg`; writeFileSync(out + '/' + name, Buffer.from(f.data, 'base64')); frames.push({ t: f.metadata.timestamp, file: name }); await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 });
  const now = () => Date.now() / 1000;
  const r = {
    p, c, base,
    wait: (ms) => p.waitForTimeout(ms),
    mark: (name) => events.push({ type: 'step', name, t: now() }),
    dbg: async (name) => { if (debug) await p.screenshot({ path: `${out}/dbg_${shot++}_${name}.png` }); },
    // Սահուն թերթել (էջը կամ մենյուի պես ներքին պատուհանը), մինչև տարրը հանգիստ երևա, ոչ թե միանգամից թռնել
    async reveal(loc, { top = 100, bottom = 170 } = {}) {
      await loc.waitFor({ state: 'visible' });
      const moved = await loc.evaluate(async (el, [mTop, mBottom]) => {
        let box = el.parentElement;
        while (box && box !== document.body && box !== document.documentElement) {
          const st = getComputedStyle(box);
          if (/(auto|scroll)/.test(st.overflowY) && box.scrollHeight > box.clientHeight + 2) break;
          box = box.parentElement;
        }
        const win = !box || box === document.body || box === document.documentElement;
        const view = win ? { top: 0, height: innerHeight } : { top: box.getBoundingClientRect().top, height: box.clientHeight };
        const r = el.getBoundingClientRect();
        if (r.top >= view.top + mTop && r.bottom <= view.top + view.height - mBottom) return 0;
        const start = win ? scrollY : box.scrollTop;
        const max = win ? document.documentElement.scrollHeight - innerHeight : box.scrollHeight - box.clientHeight;
        const target = Math.max(0, Math.min(max, start + (r.top + r.height / 2) - (view.top + view.height * 0.45)));
        const d = target - start; if (Math.abs(d) < 2) return 0;
        const ms = Math.min(1300, Math.max(550, 380 + Math.abs(d) * 0.7)), t0 = performance.now();
        await new Promise((res) => { const f = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; const y = start + d * e; if (win) scrollTo(0, y); else box.scrollTop = y; k < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
        return d;
      }, [top, bottom]);
      if (moved) await p.waitForTimeout(350);
    },
    async tap(loc, label) {
      await r.reveal(loc);
      const bx = await loc.boundingBox();
      const x = bx.x + bx.width / 2, y = bx.y + bx.height / 2;
      events.push({ type: 'tap', label, x, y, t: now() });
      await p.touchscreen.tap(x, y);
    },
    // Մատով քաշել (օր.՝ սահող կոճակը). CDP touch իրադարձություններ, նշանը հետևում է մատին
    async drag(from, to, ms = 1200, label = 'drag') {
      const cdpT = await c.newCDPSession(p); const steps = Math.max(8, Math.round(ms / 40));
      const t0 = now();
      await cdpT.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
      for (let i = 1; i <= steps; i++) {
        const k = i / steps, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        await cdpT.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }] });
        await p.waitForTimeout(ms / steps);
      }
      await cdpT.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      events.push({ type: 'drag', label, x: from.x, y: from.y, x1: to.x, y1: to.y, t: t0, t1: now() });
    },
    async tapAt(pt, label) { events.push({ type: 'tap', label, x: pt.x, y: pt.y, t: now() }); await p.touchscreen.tap(pt.x, pt.y); },
    async type(loc, text, delay = 85) { await loc.pressSequentially(text, { delay }); },
    async scrollTo(y, ms = 900) {
      await p.evaluate(async ([y, ms]) => { const s = scrollY, d = y - s, t0 = performance.now(); await new Promise(res => { const f = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; scrollTo(0, s + d * e); k < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); }); }, [y, ms]);
    },
    async scrollToEl(loc, top = 160, ms = 900) { const bx = await loc.boundingBox(); await r.scrollTo((await p.evaluate(() => scrollY)) + bx.y - top, ms); },
    // Տեքստի կտորի կենտրոնը էկրանին (օր.՝ նախադասության կամ բառի վրա սեղմելու համար)
    async textPoint(needle, root = '.reading-body') {
      return p.evaluate(([needle, root]) => {
        const el = document.querySelector(root) ?? document.body; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let t; (t = w.nextNode());) { const i = t.data.indexOf(needle); if (i >= 0) { const rg = document.createRange(); rg.setStart(t, i); rg.setEnd(t, i + needle.length); const bx = rg.getClientRects()[0]; if (bx) return { x: bx.x + bx.width / 2, y: bx.y + bx.height / 2 }; } }
        return null;
      }, [needle, root]);
    },
    async finish() {
      await cdp.send('Page.stopScreencast'); await p.waitForTimeout(300);
      writeFileSync(out + '/timeline.json', JSON.stringify({ frames, events }, null, 1));
      console.log('frames', frames.length, 'dur', (frames.at(-1).t - frames[0].t).toFixed(1));
      await b.close();
    },
  };
  return r;
}
