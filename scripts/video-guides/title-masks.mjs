// Նոր վերնագրի դիմակներ. սպիտակ տեքստ սև ֆոնին, 1080×160 (վիդեոյի տողեր 92–251)
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 160 } });
const html = (l1, l2) => `<style>@font-face{font-family:N;src:url("file://${process.cwd()}/app/assets/fonts/NotoSerifArmenian-Bold.woff2");font-weight:700}
html,body{margin:0;background:#000;width:1080px;height:160px;overflow:hidden}
div{position:absolute;left:0;right:0;text-align:center;font-family:N;font-weight:700;font-size:52px;letter-spacing:.5px;line-height:60px;white-space:nowrap}
#a{top:10px;color:${l1}}#b{top:70px;color:${l2}}</style><div id=a>Ինչպես փոխել</div><div id=b>կայքի լուսավորությունը</div>`;
for (const [name, a, c] of [['dark', '#fff', '#000'], ['gold', '#000', '#fff']]) {
  writeFileSync(out + '/m.html', html(a, c)); await p.goto('file://' + out + '/m.html'); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${out}/mask_${name}.png` });
}
console.log(await p.evaluate(() => ['a','b'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; })));
await b.close();
