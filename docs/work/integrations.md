# Ինտեգրացիաներ

## Հիմա
- Սփորթ բոտով՝ /support, /contact → փակ Support խումբ, ադմինի reply-ը → օգտատիրոջը, `chore/support-relay`։

## Հերթ
1. Telegram խմբի կարգավորումներ՝ անդամների ցուցակ, slow mode, հակասպամ (թեմաներն արդեն փակ են)։
2. Խմբի տեսք՝ նկարագրություն, ամրացված ողջույն՝ կայքի և `t.me/armenian_apostolic_church_bot?startapp` հղումով (ամրացնել առանց ծանուցման)։
3. BotFather (production բոտ)՝ անուն, about, description, նկար։ Ամեն փոփոխությունից առաջ հարցնել տիրոջը։
4. Production բոտը միացնել կայքին՝ apostolic.am/admin → «Կապել բոտը» (սեղմում է տերը)։
5. Բոտի հրամաններ /today, /saved՝ համաձայնեցնել «Նոր հնարավորություններ»-ի նոր հասցեների (`/psalms/…`) հետ։
6. Նորությունների ալիք (channel)՝ թարմացումներ և ուսուցողական կարճ վիդեոներ. հղումը՝ «Կապ» էջում, /help-ում, ամրացված ողջույնում։
7. Տիրոջ Telegram հաշիվը և dav.tonoyan.90@gmail.com-ը production-ում ադմին դարձնել (/admin → «Կայքի ադմիններ», t0n0yan.contact@gmail.com-ով մտած)։
8. Անդամների «բաց» թեմա (նկար/գրառում)՝ մնացած թեմաները փակ են։ Կոդ՝ այդ թեման չպետք է հայտնվի կայքում որպես բաժին (bridge-ը բոլոր թեմաները բերում է, `isNavigableCategory`)։ Անել թեման ստեղծելուց առաջ, staging-ում։ Նպատակը՝ սրբավայրերի քարտեզ (քարտեզը «Նոր հնարավորություններ»-ի հերթում է, ավելի ուշ)։

## Արված
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
- Խմբում ծանուցում չուղարկել. ամրացնել առանց «Notify all members», գրել «Send without sound»-ով։
