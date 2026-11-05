// 10 Հիշեցնել՝ տեղական կայքից (մուտք գործած)
import { startRecorder } from './rec-lib.mjs';
const r = await startRecorder({ out: process.argv[2], debug: process.argv[3] === 'debug', warm: ['/pray/90212'], start: '/pray', permissions: ['notifications'], init: () => { try { localStorage.setItem('highlight-hint', '1'); } catch {} } });
const { p, wait, mark, tap, dbg } = r;
await wait(1200);
mark('open'); await wait(500);
await tap(p.getByText('Սուրբ Աստուած', { exact: true }).first(), 'material');
await p.waitForURL('**/pray/90212', { waitUntil: 'commit' }); await wait(1600);
mark('bell'); await wait(300);
await tap(p.getByRole('button', { name: /Հիշեցնել/ }).filter({ visible: true }).first(), 'bell'); await wait(1500); await dbg('sheet');
mark('daily'); await wait(300);
await tap(p.getByText('Ամեն օր', { exact: true }).filter({ visible: true }).first(), 'daily'); await wait(1300); await dbg('daily');
mark('set'); await wait(300);
await tap(p.getByRole('button', { name: 'Դնել հիշեցում' }), 'set'); await wait(2400); await dbg('set');
mark('done'); await wait(3400); await dbg('done');
await r.finish();
