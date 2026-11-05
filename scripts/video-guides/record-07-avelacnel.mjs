// 07 Ավելացնել սրբավայր՝ տեղական կայքից. ուղարկվում է միայն տեղական բազա
// Նկար՝ «Saint Hripsime Church.jpg», MSyuzan, CC BY-SA 4.0, Wikimedia Commons (PHOTO փոփոխական)
import { startRecorder } from './rec-lib.mjs';
const r = await startRecorder({ out: process.argv[2], debug: process.argv[3] === 'debug', warm: ['/places/new'], start: '/places',
  permissions: ['geolocation'], geolocation: { latitude: 40.16613, longitude: 44.30963, accuracy: 15 } });
const { p, wait, mark, tap, dbg } = r;
const chip = (t) => p.getByText(t, { exact: true }).filter({ visible: true }).first();
await wait(1500);
mark('open'); await wait(400);
await tap(p.getByRole('link', { name: /Ավելացնել սրբավայր/ }).first(), 'add');
await p.waitForURL('**/places/new', { waitUntil: 'commit' }); await wait(1800);
mark('name'); await wait(300);
const name = p.locator('input[name=name]');
await tap(name, 'name'); await r.type(name, 'Սուրբ Հռիփսիմե եկեղեցի', 80); await wait(500);
await tap(chip('Եկեղեցի'), 'kind'); await wait(900);
mark('where'); await wait(300);
await tap(chip('Ես այնտեղ եմ'), 'here'); await wait(2600); await dbg('where');
mark('photo'); await wait(300);
const chooser = p.waitForEvent('filechooser');
await tap(chip('Ընտրել նկարներ'), 'photos');
await (await chooser).setFiles(process.env.PHOTO); await wait(2500); await dbg('photo');
mark('access'); await wait(300);
await tap(chip('Այո, մինչև եկեղեցի'), 'a1'); await wait(700);
await tap(chip('Հարթ, ասֆալտապատ'), 'a2'); await wait(700);
await tap(chip('Մի քանի աստիճան'), 'a3'); await wait(1200); await dbg('access');
mark('send'); await wait(300);
await tap(chip('Ուղարկել'), 'send'); await wait(3000); await dbg('sent');
mark('done'); await wait(3200); await dbg('done');
await r.finish();
