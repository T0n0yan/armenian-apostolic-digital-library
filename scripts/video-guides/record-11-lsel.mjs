// 11 Սաղմոսը լսել տող առ տող՝ apostolic.am-ից
import { startRecorder } from './rec-lib.mjs';
const r = await startRecorder({ out: process.argv[2], debug: process.argv[3] === 'debug', base: process.env.BASE ?? 'https://apostolic.am', warm: ['/psalms/22'], start: '/psalms' });
const { p, wait, mark, tap, dbg } = r;
await wait(1200);
mark('open'); await wait(500);
await tap(p.locator('a[href="/psalms/22"]').filter({ visible: true }).first(), 'psalm');
await p.waitForURL('**/psalms/22', { waitUntil: 'commit' }); await wait(2200); await dbg('psalm');
mark('play'); await wait(400);
await tap(p.getByRole('button', { name: /Նվագարկել|Լսել|Play/ }).filter({ visible: true }).first(), 'play'); await wait(3000); await dbg('playing1');
mark('follow'); await wait(5500); await dbg('playing2');
mark('verse'); await wait(300);
await r.tapAt(await r.textPoint('Եթէ նոյնիսկ', 'article'), 'verse'); await wait(380);
await tap(p.getByRole('button', { name: 'Լսել այստեղից' }), 'from'); await wait(3500); await dbg('from');
mark('done'); await wait(3400); await dbg('done');
await r.finish();
