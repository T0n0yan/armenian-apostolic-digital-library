// 02 Տառատեսակ և տառաչափ՝ apostolic.am-ից. «մինչև»՝ սաղմոսի տեքստը, «հետո»՝ նույն տեքստը նոր տառով և չափով
import { startRecorder } from './rec-lib.mjs';
const r = await startRecorder({ out: process.argv[2], debug: process.argv[3] === 'debug', base: process.env.BASE ?? 'https://apostolic.am', start: '/psalms/22', init: () => { try { localStorage.setItem('highlight-hint', '1'); } catch {} } });
const { p, wait, mark, tap, dbg } = r;
const sheet = () => p.getByRole('dialog').filter({ hasText: 'Ընթերցանության տառատեսակ' }).first();
const opt = (t) => sheet().getByText(t, { exact: true }).filter({ visible: true }).first();
await r.scrollToEl(p.locator('.reading-body').first(), 110, 10); await wait(1500);   // տեքստը՝ «մինչև»
mark('before'); await wait(1600); await dbg('before');
mark('menu'); await wait(300);
await tap(p.getByRole('button', { name: 'Բացել մենյուն' }), 'menu'); await wait(1000);
mark('settings'); await wait(300);
await tap(p.getByText(/Կայքի լուսավորություն, տառաչափ|Թեմա, տառաչափ/).filter({ visible: true }).first(), 'settings'); await wait(1500);
mark('font'); await wait(300);
for (const f of ['Արիան', 'Նոտո', 'Պարզ', 'Նոտո']) { await tap(opt(f), f); await wait(1500); }
await dbg('font');
mark('size'); await wait(300);
const range = sheet().locator('input[type=range]').first();
await r.reveal(range, { top: 160, bottom: 260 }); await wait(400);
const box = await range.boundingBox();
const [min, max, val] = await range.evaluate((e) => [Number(e.min), Number(e.max), Number(e.value)]);
const xAt = (v) => box.x + 10 + ((v - min) / (max - min)) * (box.width - 20);
await r.drag({ x: xAt(val), y: box.y + box.height / 2 }, { x: xAt(Math.min(max, val + 5)), y: box.y + box.height / 2 }, 1600, 'size');
await wait(1600); await dbg('size');
mark('heading'); await wait(300);
await tap(opt('Մեծ'), 'heading'); await wait(1700); await dbg('heading');
mark('close'); await wait(300);
await tap(sheet().getByRole('button', { name: 'Փակել' }).first(), 'close'); await wait(900);
await r.scrollToEl(p.locator('.reading-body').first(), 110, 1100); await wait(500);   // նույն դիրքը, ինչ սկզբում
mark('done'); await wait(3800); await dbg('after');
await r.finish();
