// 13 Ավելացնել գլխավոր էկրանին՝ apostolic.am-ից (Android բրաուզեր)
import { startRecorder } from './rec-lib.mjs';
const r = await startRecorder({ out: process.argv[2], debug: process.argv[3] === 'debug', base: process.env.BASE ?? 'https://apostolic.am', start: '/' });
const { p, wait, mark, tap, dbg } = r;
await wait(1200);
mark('menu'); await wait(500);
await tap(p.getByRole('button', { name: 'Բացել մենյուն' }), 'menu'); await wait(1100);
mark('install'); await wait(300);
await tap(p.getByRole('button', { name: /Ավելացնել գլխավոր էկրանին/ }).first(), 'install'); await wait(1600); await dbg('card');
mark('add'); await wait(300);
await tap(p.getByRole('button', { name: /^\s*Ավելացնել\s*$/ }).filter({ visible: true }).first(), 'add'); await wait(2500); await dbg('hint');
mark('done'); await wait(3600); await dbg('done');
await r.finish();
