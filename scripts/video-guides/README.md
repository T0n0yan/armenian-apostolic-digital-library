# Ուսուցողական վիդեոներ (apostolic.am)

Ոճը՝ `docs/video-guides/STYLE_GUIDE.md`։ Վիդեոները (MP4) repo-ում չեն պահվում, միայն գործիքները։
Ադմինի կոճակները (`/admin`) նկարահանման ժամանակ թաքցվում են. սովորական մարդը դրանք չի տեսնում։
Քարտեզի համար ցանցում պետք է բաց լինի `tiles.openfreemap.org`-ը։

## Ինչպես պատրաստել

1. Տեղական կայք՝ `pnpm db:migrate:local`, `python3 scripts/video-guides/seed-local.py`,
   `pnpm dev --port 5174 --strictPort --host 127.0.0.1`։ Տեղականում մուտքը ավտոմատ է («Փորձնական օգտվող»)։
   Բազան փոխելուց հետո վերագործարկել սերվերը և ջնջել `.wrangler/state/v3/cache/*` (էջերը քեշավորվում են)։
2. Նկարահանում՝ `python3 scripts/video-guides/seed-local.py --reset`, հետո
   `node scripts/video-guides/record-04-pahel-kardacel.mjs <թղթապանակ> [debug]`։
   Գրում է կադրերը (`raw/`) և `timeline.json` (քայլերի և սեղմումների ժամանակները)։
3. Կոմպոզիցիա՝ `node scripts/video-guides/render.mjs <թղթապանակ> scripts/video-guides/04-pahel-kardacel.plan.json out.mp4`։
   Նախադիտում՝ վերջում ավելացնել վայրկյանները (`"1.5,7,22"`), կստացվեն PNG-ներ։
4. Նոր վիդեո՝ պատճենել record-ը (փոխել քայլերը, `mark('…')` և `tap(...)`) և plan-ը (վերնագիր, քայլերի տեքստ)։

`stage.html`-ում է ամբողջ դիզայնը՝ ֆոն, վերնագիր, քայլի պիտակ, հեռախոս, սեղմման նշան, `apostolic.am`։
Էկրանը կտրվում է կլոր անկյուններով հենց առաջին կադրից (`overflow:hidden` + `border-radius`)։
`rec-lib.mjs`-ի `tap()`-ը սեղմելուց առաջ **սահուն** թերթում է էջը կամ ներքին պատուհանը (մենյու), մինչև կոճակը երևա (`reveal`). մի՛ օգտագործիր `scrollIntoViewIfNeeded`, այն թռցնում է կադրը։
Երկտողանի վերնագիր՝ plan-ի `title`-ում `<br>`։

`fix-corners.py`՝ հին (ChatGPT-ով արված) վիդեոների սկզբի քառակուսի անկյունները կլորացնելու համար
(`python3 fix-corners.py in.mp4 out.mp4 <առաջին կադր> <վերջին կադր> <ճիշտ կադրի համար>`)։

## Վիդեոների ցանկը

| # | Վիդեո | Որտեղից | Սցենար |
| --- | --- | --- | --- |
| 01 | Թեմա | ChatGPT (անկյունները՝ `fix-corners.py`) | — |
| 02 | Տառատեսակ և տառաչափ | ChatGPT | — |
| 03 | Ինչպես որոնել | apostolic.am | `record-03-voronum.mjs` |
| 04 | Պահել և նշել կարդացածը + օրացույց | տեղական | `record-04-pahel-kardacel.mjs` |
| 05 | Պահել ընտրած խոսքը | տեղական | `record-05-pahel-khosqy.mjs` |
| 06 | Սրբավայրեր քարտեզում (Մայր Աթոռ) | տեղական + `seed-place.py` | `record-06-qartez.mjs` |
| 07 | Ավելացնել սրբավայր (Ս. Հռիփսիմե) | տեղական | `record-07-avelacnel.mjs` (`PHOTO=...`) |
| 08 | Ինչպես մուտք գործել | apostolic.am | `record-08-mutq.mjs` |
| 09 | Պահել հարցը՝ հոգևորականին հարցնելու համար (+ ⛪ եկեղեցին մոտ է հուշումը) | տեղական | `record-09-harc.mjs` |
| 10 | Հիշեցում կարդալու մասին | տեղական* | `record-10-hishecnel.mjs` |
| 11 | Լսել սաղմոսը | apostolic.am | `record-11-lsel.mjs` |
| 12 | Անծանոթ բառեր (բառարան) | apostolic.am | `record-12-bararan.mjs` |
| 13 | Կայքը՝ հավելվածի պես | apostolic.am | `record-13-glkhavor.mjs` |

apostolic.am-ից՝ `BASE` փոփոխականով կարելի է փոխել (օր.՝ staging)։ Մուտք պահանջողները՝ տեղական (`seed-local.py --reset` ամեն նկարահանումից առաջ)։
\* 10. տեղական «Փորձնական օգտվողին» `app/routes/reminders.ts`-ը հիշեցում պահել չի թողնում. նկարահանման ժամանակ
այդ ստուգումը ժամանակավոր հանվում է, հետո `git checkout app/routes/reminders.ts` (commit չանել)։
08. Telegram-ի էջը չի նկարվում. cloud-ից այն ցույց է տալիս սերվերի երկիրը (+1)։

**Նկարների հեղինակներ** (հրապարակելիս նշել). 06 (2025)՝ Lohen11 (CC BY 4.0), Yerevantsi (CC BY 4.0), Jaba1977 (CC BY-SA 4.0), Wikimedia Commons.
07՝ «Saint Hripsime Church.jpg», MSyuzan, CC BY-SA 4.0, Wikimedia Commons։
