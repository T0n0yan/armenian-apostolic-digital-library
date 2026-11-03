# Բագեր

## Հիմա
- GPT QA ուղղումները պատրաստ են Claude-ի review-ին՝ `fix/gpt-qa-review`։ Զեկույց՝ [docs/qa/GPT-REVIEW.md](../qa/GPT-REVIEW.md)։ Staging/production չի հրապարակվել՝ ըստ տիրոջ պահանջի։

## Հերթ
- Telegram-ում Ղուկաս 4.31–41 գրառման տառասխալը ուղղում է տերը ինքը Telegram-ում (կայքը կթարմանա ինքնաբերաբար)։
- Story-ի 9:16 նկարով կիսվել (հրեշտակներ անկյուններում, ներքևում apostolic.am, «նկարով թե հղումով» հարց) — սպասում է դիզայնի համաձայնեցման։

## Արված
- 2026-11-03 — Սրբավայրի նկարների թռթռոցը ուղղված է, նկարները՝ WebP ([PR #100](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/100))։ Հին նկարները՝ /admin/places-ի կոճակով։
- 2026-10-21 — Android/Telegram-ում աուդիոյի «ձևաչափը չի աջակցվում» սխալը՝ իրականում բեռնման խափանում. ավելացվեց պահեստային հասցե, կրկնակի փորձ, ճիշտ հաղորդագրություն ([#20](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/20))։
- 2026-10-22 — Սխալի էջեր (404/403/500/503), /admin առանց իրավունքի → գլխավոր էջ ([#21](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/21))։
- 2026-10-23 — 404 էջի ներդիրում մեկ ճիշտ վերնագիր («Էջը չի գտնվել») ([#24](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/24))։
- 2026-10-23 — Ծանուցումներ. հետին պլանում բաց հավելվածն այլևս չի «կլանում» հիշեցումը (սերվերը ուղարկում է հեռախոսին), «1 րոպեից»-ը զանգում է, «Կարդացել եմ»-ը և հետաձգումը այլևս հետ չեն գալիս ([#24](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/24))։
- 2026-10-23 — Նյութերի նկարները միանգամից լրիվ որակով, սեղմելիս՝ ամբողջ էկրանով («Ամբողջ չափով» կոճակը հանված է) ([#24](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/24))։
- 2026-10-23 — Փակ Telegram թեմաների «փակված» նշումը հանված է կայքից ([#24](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/24))։

- 2026-10-24 — Որոնման 503 (Workers Free-ի 10 մվ CPU). որոնումը FTS-ով ու միայն «→»/Enter-ով, առանց նախնական բեռնման, «ով է կայքում»-ը սարքից մեկ անգամ ([#42](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/42))։
- 2026-10-24 — Ամեն րոպեի cron-ը հանված է. սինքը՝ նոր գրառումից 15 րոպե հետո, հիշեցումները՝ ճիշտ ժամին (Clock Durable Object), հիշեցում հեռախոսի օրացույցով կամ ծանուցումով ([#43](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/43))։
- 2026-10-24 — /admin/people. գրանցվածների և անանուն սարքերի ցուցակ, որոնում, Excel ([#44](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/44))։
- 2026-10-24 — Վերնագրերի որոնում հեռախոսում (առանց հարցման), անգլերեն/ռուսերեն բառեր, էջերը պահվում են հեռախոսում մինչև նոր նյութ ([#45](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/45))։
- 2026-10-24 — Աղոթքների տառաչափը աշխատում է, «Օրվա համարը»-ի և «Սարքի պես» թեմայի փոփոխությունները՝ միանգամից, ամսաթվերը՝ հայերեն ամսանուններով («M10»-ի փոխարեն) ([#47](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/47))։
- 2026-11-03 — Քարտեզը drag չէր անում ուրվագծից դուրս (cursor-ը սովորական էր). քարտեզի container-ին `clip-path` էր դրված (Հայաստանի ձև), որը կտրում է նաև pointer events-ը։ Անցել է CSS `mask`-ի՝ նույն ուրվագիծը, բայց ամբողջ ուղղանկյունը մնում է քաշելի (`fix/map-mask-drag`)։
- 2026-11-03 — Սրբավայրի նկարը բացելիս համակարգչում կտրվում էր՝ երևում էր միայն վերին մասը։ Պատճառը՝ `PhotoGallery`-ի grid-centering-ը (percentage `max-height`-ը չի լուծվում auto grid-track-ի դիմաց)։ Անցել է flex-centering + `object-contain`. ամեն նկար հիմա ամբողջովին է երևում, բոլորը՝ նույն շրջանակում։ Ավելացվեց խոշորացում (＋/−, անիվ, կրկնակի սեղմում, pinch) ու քաշելով տեղաշարժ (`fix/photo-gallery-zoom`)։
- 2026-11-03 — Սրբավայրի էջը հեռախոսում աջից կպչում էր պատին և բացվելիս/ռեֆրեշից հետո «թռթռում» էր։ Պատճառները՝ (1) փոքր քարտեզի `min-height: 220px` + `aspect-ratio: 16/10`-ը դառնում էր 352px նվազագույն լայնություն, ու նեղ էկրանին ամբողջ էջը լայնանում էր, (2) նկարների շրջանակները մինչև բեռնվելը 0 լայնություն ունեին, իսկ բարձրությունը բեռնվելուց հետո ~140px փոխվում էր, ու էջը ամեն նկարի հետ ցատկում էր։ Ուղղում՝ քարտեզի շրջանակին `min-width: 0`, `article`-ին մեկ `minmax(0,1fr)` սյուն, նկարների շրջանակին կայուն բարձրություն և նվազագույն լայնություն։ Նաև զանգակի `useSyncExternalStore`-ի server snapshot-ը հիմա նույն դատարկ ցանկն է ([#98](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/98))։

## Կարևոր մյուսների համար
- Նկար վերբեռնելիս՝ `toWebp()` (`app/utils/image-webp.ts`). բրաուզերում WebP ≤1920px։ Worker-ում փոխարկել չենք կարող (անվճար պլանի CPU)։ Բոտից եկած նկարները JPEG են մնում, մինչև ադմինը սեղմի «Դարձնել WebP»։
- Cron-ը հիմա միայն գիշերային է (`17 0 * * *`)։ Սինքը և հիշեցումները ժամանակացույց են դնում `CLOCK` Durable Object-ի alarm-ով (`workers/clock.ts`)։ Production-ում `SYNC_ON_POSTS=1`. webhook-ը նոր գրառումից հետո սինք է պլանավորում 15 րոպե հետո։ Webhook-ը հիմա ստանում է նաև `edited_message` (գիշերային cron-ը ինքն է թարմացնում)։
- `reminders.channel` ('push' | 'calendar'), migration 0030։ Օրացույցով հիշեցումները սերվերը չի ուղարկում։
- Migration 0031՝ ինդեքս `library_materials(updated_at)`-ի վրա. `contentVersion`-ը (root loader) դրանից է հաշվում։ Վերնագրերի ինդեքսը՝ `/api/search-index?v=…`։ Service worker v5-ը պահում է էջերի տվյալները ըստ այդ տարբերակի. նոր նյութից հետո (մինչև 5 րոպե edge cache) հեռախոսները նորից են բերում։
- Ամսաթվերի համար `toLocaleString("hy-AM")` մի օգտագործեք (որոշ հեռախոսներում «M10» է). `app/utils/armenian-date.ts`-ի `formatDayMonth`, `formatClock`, `formatYerevanDateTime`։
- Workers Free-ում հարցման CPU-ն 10 մվ է. ծանր հաշվարկը տեղափոխեք D1 SQL կամ հեռախոս։
- Telegram-ում «փակ» թեման նշանակում է միայն, որ գրում են ադմինները. կայքում դա ընթերցողներին ցույց չի տրվում (միայն «թաքցված»-ն է նշվում)։
- MediaError code 4-ը Android WebView-ում հաճախ նշանակում է «ֆայլը չհասավ», ոչ թե ձևաչափ։
- Քարտեզի ուրվագիծը `clip-path`-ով մի տվեք. այն կտրում է նաև մկնիկի/մատի event-ները, ու ուրվագծից դուրս drag չի աշխատում։ Օգտագործեք CSS `mask` (`app/components/places-map.tsx`-ի `clip()`)՝ երևույթը նույնն է, բայց ամբողջ ուղղանկյունը մնում է ինտերակտիվ։
- Ամբողջ էկրանով նկար (lightbox) ցույց տալիս՝ `display:grid`-ով մի կենտրոնացրեք. percentage `max-height:100%`-ը auto grid-track-ում չի գործում ու բարձր նկարը արտահոսում է (կտրվում վերևից)։ Օգտագործեք `flex` + `object-contain` (`app/components/photo-gallery.tsx`)։
- `aspect-ratio`-ով տարրին `min-height` տալիս այն դառնում է նաև նվազագույն լայնություն (min-height × ratio)։ Grid/flex-ի մեջ ծնողին տվեք `min-width: 0` (կամ `grid-cols-[minmax(0,1fr)]`), այլապես նեղ էկրանին էջը լայնանում է ու աջից կպչում պատին։
- Նկարի շրջանակին, որը բեռնվում է, միշտ տվեք կայուն բարձրություն (և նվազագույն լայնություն), որ նկարը գալիս էջը չցատկի։
