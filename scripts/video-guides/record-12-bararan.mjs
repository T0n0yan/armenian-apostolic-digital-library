// 12 Բառարան՝ apostolic.am-ից. կետագծով բառը բացատրվում է
import { startRecorder } from './rec-lib.mjs';
const r = await startRecorder({ out: process.argv[2], debug: process.argv[3] === 'debug', base: process.env.BASE ?? 'https://apostolic.am', warm: [], start: '/psalms/22' });
const { p, wait, mark, tap, dbg } = r;
await wait(1500);
mark('open'); await wait(600);
await r.scrollToEl(p.locator('.reading-body').first(), 120, 1100); await wait(1600);
mark('word'); await wait(400);
await r.tapAt(await r.textPoint('գաւազանն', 'article'), 'word1'); await wait(3400); await dbg('card1');
mark('close'); await tap(p.getByRole('button', { name: 'Փակել' }).filter({ visible: true }).last(), 'close'); await wait(1000);
mark('word2'); await wait(300);
await r.tapAt(await r.textPoint('Ողորմութիւնը', 'article'), 'word2'); await wait(3200); await dbg('card2');
mark('done'); await wait(3000); await dbg('done');
await r.finish();
