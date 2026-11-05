// 08 Մուտք՝ apostolic.am-ից (հյուրի տեսքով). Telegram-ի էջը չենք ցույց տալիս. սերվերի երկիրը (+1) կշփոթի
import { startRecorder } from './rec-lib.mjs';
const r = await startRecorder({ out: process.argv[2], debug: process.argv[3] === 'debug', base: process.env.BASE ?? 'https://apostolic.am', start: '/' });
const { p, wait, mark, tap, dbg } = r;
await wait(1200);
mark('menu'); await wait(500);
await tap(p.getByRole('button', { name: 'Բացել մենյուն' }), 'menu'); await wait(1100);
mark('signin'); await wait(300);
await tap(p.getByRole('link', { name: /Մուտք գործել/ }).filter({ visible: true }).first(), 'signin'); await wait(2600); await dbg('page');
mark('choose'); await wait(2200);
mark('done'); await wait(3000); await dbg('done');
await r.finish();
