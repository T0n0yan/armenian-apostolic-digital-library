# Ինտեգրացիաներ

## Հիմա
- Անվճար պլանի օպտիմալացում և գլխավոր ադմինի օգտագործման վահանակ՝ `feat/free-tier-efficiency`, կոդ՝ `15a60ba`։ Push-ը հաջողված է, staging merge՝ `c0391b6` ([Deploy](https://github.com/T0n0yan/armenian-apostolic-digital-library/actions/runs/40739457560))։ Staging-ի build/tests/migrations/deploy-ը հաջող են (2026-10-28 17:51 UTC)։ Production-ի լիազորությունը տրված է, բայց GitHub API-ն PR ստեղծելիս `Forbidden` է վերադարձնում, իսկ live կայքերը՝ proxy CONNECT 403։ Հանձնում՝ [հաշվետվություն](../qa/FREE-TIER-REVIEW.md)։
- Սրբավայրերի քարտեզ՝ `feat/places-map` (հանված է staging-ից 2026-10-23, տերը կվերադառնա)։ Staging DB-ում մնացել են 0028/0029 աղյուսակները և 9 փորձնական տեղ։

## Հերթ
1. Telegram խմբի կարգավորումներ՝ անդամների ցուցակ, slow mode, հակասպամ (թեմաներն արդեն փակ են)։
2. BotFather (production բոտ)՝ անուն, about, description, նկար։ Ամեն փոփոխությունից առաջ հարցնել տիրոջը։
3. Բոտի հրամաններ /today, /saved՝ համաձայնեցնել «Նոր հնարավորություններ»-ի նոր հասցեների (`/psalms/…`) հետ։
4. Նորությունների ալիք (channel)՝ թարմացումներ և ուսուցողական կարճ վիդեոներ. հղումը՝ «Կապ» էջում, /help-ում, ամրացված ողջույնում։
5. Տիրոջ Telegram հաշիվը և dav.tonoyan.90@gmail.com-ը production-ում ադմին դարձնել (/admin → «Կայքի ադմիններ», t0n0yan.contact@gmail.com-ով մտած)։
6. Անդամների «բաց» թեմա (նկար/գրառում)՝ մնացած թեմաները փակ են։ Կոդ՝ այդ թեման չպետք է հայտնվի կայքում որպես բաժին (bridge-ը բոլոր թեմաները բերում է, `isNavigableCategory`)։ Անել թեման ստեղծելուց առաջ, staging-ում։ Նպատակը՝ սրբավայրերի քարտեզ (քարտեզը «Նոր հնարավորություններ»-ի հերթում է, ավելի ուշ)։

## Արված
- 2026-10-23 — Բոտը գլխավոր խմբում ադմին է (Pin messages, Allow Groups-ը հետո անջատված)։ Ողջույնը նկարով և կոճակներով («Բացել Telegram-ում», «Բացել բրաուզերում», «Կապ մեզ հետ») հրապարակվեց և ամրացվեց առանց ծանուցման. տեքստը խմբագրվում է /admin → «Ողջույն խմբում» (`site_settings.group_welcome`) ([#36](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/36), [#39](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/39))։ Խմբի նկարագրությունը թարմացված է։
- 2026-10-23 — Տիրոջ ցուցակը՝ օրվա ընթերցման նկարում միայն ենթավերնագիրը (չկա՝ ընթերցումները), «Լսել», հավելվածի լրիվ անունը, թռչնագրի նախաբեռնում, կարգավորումները մեկ տողով, footer-ի տարածություն, Կապ էջի հասցեի պատճենում, նոր աղավնի ամենուր (`scripts/build-brand-assets.py`) ([#28](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/28))։ «Բագեր» և «Նոր հնարավորություններ» չաթերը փակված էին, արվեց այստեղ։
- 2026-10-23 — Սփորթ բոտով՝ /support, /contact → փակ Support խումբ (թեմաներ՝ Տեխնիկական 2, Հարցեր և առաջարկներ 7), ադմինի Reply-ը → օգտատիրոջը. staging-ում ստուգեց տերը ([#26](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/26))։
- 2026-10-23 — BotFather՝ «Գրադարան» menu button և Main Mini App → https://apostolic.am։
- 2026-10-23 — Support խումբը ստեղծված է (տերը)՝ Topics միացված, երկու բոտն էլ ադմին են (Delete messages, Manage topics)։
- 2026-10-23 — BotFather `/setdomain`՝ staging բոտ → staging.apostolic.am, @armenian_apostolic_church_bot → apostolic.am. Telegram-ով մուտքը աշխատում է երկու կայքում էլ։
- 2026-10-23 — Երեք էլ. հասցե կայքում՝ contact@ (հարցեր), support@ (տեխնիկական), info@ (պաշտոնական, գաղտնիություն). թողարկվեց #24-ով։
- 2026-10-22 — Telegram խմբի բոլոր թեմաները փակված են (գրում են միայն ադմինները)։
- 2026-10-21 — info@apostolic.am, դոմենը Cloudflare-ում, media.apostolic.am։

## Կարևոր մյուսների համար
- 2026-10-28 — Տիրոջ նոր պահանջը՝ հաշվիչների ակտիվացումը հետաձգել։ Ենթակառուցվածքային/production յուրաքանչյուր քայլից առաջ ներկայացնել կոնկրետ առաջարկը և սպասել տիրոջ ընտրությանը։ WebStorm local ուղեցույց՝ [WEBSTORM-LOCAL.md](../qa/WEBSTORM-LOCAL.md)։ Cloud-ում development սերվերը ստուգված է՝ գլխավոր/բաժին/նյութ HTTP 200, սակայն օգտագործողի համակարգչի գործարկումը դեռ չի ստուգվել։
- 2026-10-28 — Անվճար պլանի աշխատանքի ամբողջ հանձնման փաստաթուղթը՝ [FREE-TIER-REVIEW.md](../qa/FREE-TIER-REVIEW.md)։ Նոր `/admin/usage` և `/admin/media-inventory` էջերը միայն owner-ին են։ Analytics-ի համար առանձին Worker secret է պետք. թվերը դեռ live չեն ստուգվել։ Backup workflow-ը առանց կարգավորման բաց է թողնվում։
- Խմբի բոլոր թեմաները փակ են. «փակ» նշանակում է միայն «գրում են ադմինները», կայքում այն ցույց տալ պետք չէ։
- Փոստը Zoho Mail-ում է. info@, contact@, support@ մեկ փոստարկղի alias-ներ են։ Կոդում՝ `app/utils/contact.ts` (`INFO_EMAIL`, `CONTACT_EMAIL`, `SUPPORT_EMAIL`)։
- Բոտի պատասխանները՝ `app/data/telegram-bot-replies.server.ts` (/start, /help, deep link-եր՝ `saghmosner_22`)։ Deep link-երը փոխելիս՝ հին ձևը թողնել աշխատող։
- Support խումբ՝ `SUPPORT_CHAT_ID` և թեմաները `wrangler.jsonc`-ում. երկու բոտն էլ այնտեղ ադմին են, ամեն մեկը փոխանցում է միայն իր հաղորդագրությունների reply-ները։ Բոտին գրված ցանկացած ոչ-հրաման նամակ գնում է Support խումբ։
- Պատկերակները՝ `design/logo/dove/source.webp` → `python3 scripts/build-brand-assets.py`. փոխելիս բարձրացնել `?v=` համարը (`app/root.tsx`, `manifest.webmanifest`, `app/utils/seo.ts`)։
- Կիսվելու նկարները նկարում է `og-cards.yml`-ը deploy-ից հետո. դիզայնը փոխելիս բարձրացնել `OG_CARD_LAYOUT`-ը։
- Քարտեզը՝ Leaflet + OpenStreetMap, միայն Հայաստանը (`app/utils/armenia-border.ts`, OSM-ից, պարզեցված). սահմանից դուրսը ծածկված է։ Գծանկարների prompt-ը՝ `DRAWING_PROMPT` (`app/routes/admin-place.tsx`)։
- Խմբում ծանուցում չուղարկել. ամրացնել առանց «Notify all members», գրել «Send without sound»-ով։
