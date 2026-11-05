// 06 Սրբավայրեր քարտեզում՝ տեղական կայքից (Մայր Աթոռ, seed-place.py)
import { startRecorder } from './rec-lib.mjs';
const r = await startRecorder({ out: process.argv[2], debug: process.argv[3] === 'debug', warm: ['/places', '/places/mayr-ator-surb-ejmiatsin'], start: '/',
  init: () => { try { localStorage.removeItem('places-view'); } catch {} } });
const { p, wait, mark, tap, tapAt, dbg } = r;
const scrollToEl = (loc, top, ms) => r.scrollToEl(loc, top, ms);
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
await r.finish();
