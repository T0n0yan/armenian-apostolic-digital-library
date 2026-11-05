# Ուսուցողական վիդեոներ (apostolic.am)

Ոճը՝ `docs/video-guides/STYLE_GUIDE.md`։ Վիդեոները (MP4) repo-ում չեն պահվում, միայն գործիքները։

## Ինչպես պատրաստել

1. Տեղական կայք՝ `pnpm db:migrate:local`, `python3 scripts/video-guides/seed-local.py`,
   `pnpm dev --port 5174 --strictPort --host 127.0.0.1`։ Տեղականում մուտքը ավտոմատ է («Փորձնական օգտվող»)։
   Բազան փոխելուց հետո վերագործարկել սերվերը և ջնջել `.wrangler/state/v3/cache/*` (էջերը քեշավորվում են)։
2. Նկարահանում՝ `python3 scripts/video-guides/seed-local.py --reset`, հետո
   `node scripts/video-guides/record-02-pahel-kardacel.mjs <թղթապանակ> [debug]`։
   Գրում է կադրերը (`raw/`) և `timeline.json` (քայլերի և սեղմումների ժամանակները)։
3. Կոմպոզիցիա՝ `node scripts/video-guides/render.mjs <թղթապանակ> scripts/video-guides/02-pahel-kardacel.plan.json out.mp4`։
   Նախադիտում՝ վերջում ավելացնել վայրկյանները (`"1.5,7,22"`), կստացվեն PNG-ներ։
4. Նոր վիդեո՝ պատճենել record-ը (փոխել քայլերը, `mark('…')` և `tap(...)`) և plan-ը (վերնագիր, քայլերի տեքստ)։

`stage.html`-ում է ամբողջ դիզայնը՝ ֆոն, վերնագիր, քայլի պիտակ, հեռախոս, սեղմման նշան, `apostolic.am`։
Էկրանը կտրվում է կլոր անկյուններով հենց առաջին կադրից (`overflow:hidden` + `border-radius`)։

`fix-corners.py`՝ հին (ChatGPT-ով արված) վիդեոների սկզբի քառակուսի անկյունները կլորացնելու համար
(`python3 fix-corners.py in.mp4 out.mp4 <առաջին կադր> <վերջին կադր> <ճիշտ կադրի համար>`)։
