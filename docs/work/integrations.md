# Ինտեգրացիաներ

## Հիմա
- Production բոտը կապել (apostolic.am/admin → «Կապել բոտը», սեղմում է տերը) և ստուգել սփորթը։

## Հերթ
1. Telegram խմբի կարգավորումներ՝ անդամների ցուցակ, slow mode, հակասպամ (թեմաներն արդեն փակ են)։
2. Խմբի տեսք՝ նկարագրություն, ամրացված ողջույն՝ կայքի և `t.me/armenian_apostolic_church_bot?startapp` հղումով (ամրացնել առանց ծանուցման)։
3. BotFather (production բոտ)՝ անուն, about, description, նկար։ Ամեն փոփոխությունից առաջ հարցնել տիրոջը։
4. Բոտի հրամաններ /today, /saved՝ համաձայնեցնել «Նոր հնարավորություններ»-ի նոր հասցեների (`/psalms/…`) հետ։
5. Նորությունների ալիք (channel)՝ թարմացումներ և ուսուցողական կարճ վիդեոներ. հղումը՝ «Կապ» էջում, /help-ում, ամրացված ողջույնում։
6. Տիրոջ Telegram հաշիվը և dav.tonoyan.90@gmail.com-ը production-ում ադմին դարձնել (/admin → «Կայքի ադմիններ», t0n0yan.contact@gmail.com-ով մտած)։
7. Անդամների «բաց» թեմա (նկար/գրառում)՝ մնացած թեմաները փակ են։ Կոդ՝ այդ թեման չպետք է հայտնվի կայքում որպես բաժին (bridge-ը բոլոր թեմաները բերում է, `isNavigableCategory`)։ Անել թեման ստեղծելուց առաջ, staging-ում։ Նպատակը՝ սրբավայրերի քարտեզ (քարտեզը «Նոր հնարավորություններ»-ի հերթում է, ավելի ուշ)։

## Արված
- 2026-10-23 — Տիրոջ ցուցակը՝ օրվա ընթերցման նկարում միայն ենթավերնագիրը (չկա՝ ընթերցումները), «Լսել», հավելվածի լրիվ անունը, թռչնագրի նախաբեռնում, կարգավորումները մեկ տողով, footer-ի տարածություն, Կապ էջի հասցեի պատճենում, նոր աղավնի ամենուր (`scripts/build-brand-assets.py`) ([#28](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/28))։ «Բագեր» և «Նոր հնարավորություններ» չաթերը փակված էին, արվեց այստեղ։
- 2026-10-23 — Սփորթ բոտով՝ /support, /contact → փակ Support խումբ (թեմաներ՝ Տեխնիկական 2, Հարցեր և առաջարկներ 7), ադմինի Reply-ը → օգտատիրոջը. staging-ում ստուգեց տերը ([#26](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/26))։
- 2026-10-23 — BotFather՝ «Գրադարան» menu button և Main Mini App → https://apostolic.am։
- 2026-10-23 — Support խումբը ստեղծված է (տերը)՝ Topics միացված, երկու բոտն էլ ադմին են (Delete messages, Manage topics)։
- 2026-10-23 — BotFather `/setdomain`՝ staging բոտ → staging.apostolic.am, @armenian_apostolic_church_bot → apostolic.am. Telegram-ով մուտքը աշխատում է երկու կայքում էլ։
- 2026-10-23 — Երեք էլ. հասցե կայքում՝ contact@ (հարցեր), support@ (տեխնիկական), info@ (պաշտոնական, գաղտնիություն). թողարկվեց #24-ով։
- 2026-10-22 — Telegram խմբի բոլոր թեմաները փակված են (գրում են միայն ադմինները)։
- 2026-10-21 — info@apostolic.am, դոմենը Cloudflare-ում, media.apostolic.am։

## Կարևոր մյուսների համար
- Խմբի բոլոր թեմաները փակ են. «փակ» նշանակում է միայն «գրում են ադմինները», կայքում այն ցույց տալ պետք չէ։
- Փոստը Zoho Mail-ում է. info@, contact@, support@ մեկ փոստարկղի alias-ներ են։ Կոդում՝ `app/utils/contact.ts` (`INFO_EMAIL`, `CONTACT_EMAIL`, `SUPPORT_EMAIL`)։
- Բոտի պատասխանները՝ `app/data/telegram-bot-replies.server.ts` (/start, /help, deep link-եր՝ `saghmosner_22`)։ Deep link-երը փոխելիս՝ հին ձևը թողնել աշխատող։
- Support խումբ՝ `SUPPORT_CHAT_ID` և թեմաները `wrangler.jsonc`-ում. երկու բոտն էլ այնտեղ ադմին են, ամեն մեկը փոխանցում է միայն իր հաղորդագրությունների reply-ները։ Բոտին գրված ցանկացած ոչ-հրաման նամակ գնում է Support խումբ։
- Պատկերակները՝ `design/logo/dove/source.webp` → `python3 scripts/build-brand-assets.py`. փոխելիս բարձրացնել `?v=` համարը (`app/root.tsx`, `manifest.webmanifest`, `app/utils/seo.ts`)։
- Կիսվելու նկարները նկարում է `og-cards.yml`-ը deploy-ից հետո. դիզայնը փոխելիս բարձրացնել `OG_CARD_LAYOUT`-ը։
- Խմբում ծանուցում չուղարկել. ամրացնել առանց «Notify all members», գրել «Send without sound»-ով։
