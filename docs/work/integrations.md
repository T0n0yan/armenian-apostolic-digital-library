# Ինտեգրացիաներ

## Հիմա
- Երեք էլ. հասցե կայքում (info/contact/support), `chore/contact-emails` — staging-ում է, սպասում է «թողարկիր»-ին։
- Telegram խմբի կարգավորումներ (Հերթ 1–2)՝ տերը որոշում է քայլ առ քայլ։

## Հերթ
1. Telegram խմբի գաղտնիություն և թույլտվություններ՝ ով ինչ թեմայում կարող է գրել, անդամների ցուցակ, slow mode, հակասպամ։
2. Խմբի տեսք՝ անուն, նկարագրություն, ամրացված ողջույն՝ կայքի և բոտի հղումով։
3. BotFather (production բոտ)՝ նկարագրություն, նկար, պատվերներ, Mini App URL `https://apostolic.am`։ Ամեն փոփոխությունից առաջ հարցնել տիրոջը։
4. Production բոտը միացնել կայքին՝ apostolic.am/admin → «Կապել բոտը» (սեղմում է տերը)։
5. Սփորթ՝ բոտին գրված հաղորդագրությունները փոխանցվում են փակ «Support» խմբին, ադմինի պատասխանը վերադառնում է օգտատիրոջը (հիմնական բոտով, երկրորդ բոտ պետք չէ)։ Սպասում է՝ տերը ստեղծի խումբը և ավելացնի բոտը։
6. Տիրոջ Telegram հաշիվը և dav.tonoyan.90@gmail.com-ը production-ում ադմին դարձնել (/admin → «Կայքի ադմիններ», t0n0yan.contact@gmail.com-ով մտած)։
7. BotFather `/setdomain`՝ Telegram-ով մուտք բրաուզերում (Login Widget). production բոտ՝ `apostolic.am`, staging բոտ՝ `staging.apostolic.am`։ Անել, երբ «Նոր հնարավորություններ» չաթը պատրաստ լինի, տիրոջը հարցնելուց հետո։

## Արված
- 2026-10-21 — info@apostolic.am (Cloudflare Email Routing), դոմենը Cloudflare-ում, media.apostolic.am։

## Կարևոր մյուսների համար
- Փոստը հիմա Zoho Mail-ում է (MX, SPF, DKIM, DMARC). info@, contact@, support@ մեկ փոստարկղի alias-ներ են։ Կոդում՝ `app/utils/contact.ts` (`INFO_EMAIL`, `CONTACT_EMAIL`, `SUPPORT_EMAIL`). տեխնիկական սխալների համար՝ support@, հարցեր/առաջարկներ՝ contact@, գաղտնիություն և պաշտոնական՝ info@։
- Բոտի պատասխանները՝ `app/data/telegram-bot-replies.server.ts` (/start, /help, deep link-եր՝ `saghmosner_22`)։
