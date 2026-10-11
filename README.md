# Հայ Առաքելական Սուրբ Եկեղեցու թվային գրադարան

Telegram Mini App-first թվային գրադարան՝ խմբի նյութերի որոնման, նավիգացիայի, անձնական պահպանման և հետագայում սրբավայրերի քարտեզի համար։

## Տեխնիկական հիմք

- TypeScript
- React 19
- React Router 8՝ server-side rendering-ով
- Cloudflare Workers
- Cloudflare D1
- pnpm

## Տեղական աշխատանք

```bash
pnpm install
pnpm dev
```

Տեղական D1 migration-ները կիրառելու համար՝

```bash
pnpm db:migrate:local
```

## Ստուգումներ

```bash
pnpm typecheck
pnpm build
```

## Telegram JSON ներմուծում

Admin էջը ընդունում է Telegram Desktop-ի `result.json` export-ը։ Առաջին
քայլում ցուցադրվում է համեմատության preview, իսկ հաստատումից հետո ներմուծվում
են միայն նոր կամ փոփոխված հրապարակումները։ Նույն chat ID + message ID զույգը
չի կարող կրկնակի ինդեքսավորվել։ Կրկնվող export-ները պահեստում չեն կուտակվում՝
յուրաքանչյուր նյութի համար պահվում է միայն վերջին տեքստային վիճակը և որոնման
metadata-ն։ Նկարները, աուդիոները և վիդեոները չեն պահվում։

## Որոնում և «Իմ անկյունը»

- `/search` էջը փնտրում է վերնագրերի և Telegram-ից ներմուծված ամբողջ տեքստի մեջ։ Արդյունքները կարելի է զտել ըստ բաժնի, տեսակի և ամսաթվի։
- Օգտվողի պահած նյութերը պահպանվում են D1-ում, ոչ թե միայն browser storage-ում։
- Telegram Mini App-ը ստորագրված `initData`-ով հաստատում է օգտվողին և ստեղծում է HttpOnly session cookie։
- Production միջավայրում պետք է Cloudflare Worker secret-ի տեսքով սահմանվի `TELEGRAM_BOT_TOKEN`։ Token-ը երբեք չի պահվում repository-ում։
- Միայն development build-ում localhost-ից օգտագործվում է առանձին փորձնական օգտվող, որպեսզի պահպանման հոսքը հնարավոր լինի ստուգել առանց Telegram client-ի։

## Անվտանգության սկզբունքներ

- Հավելվածը Telegram խմբում չի հրապարակում, չի խմբագրում և չի ջնջում հաղորդագրություններ։
- `/admin` ուղին production build-ում փակ է և պահանջում է Cloudflare Access-ի վավեր ստորագրված JWT։
- Admin մուտքի համար Worker-ի միջավայրում պետք է սահմանվեն `CF_ACCESS_TEAM_DOMAIN` և `CF_ACCESS_AUD` արժեքները։ Առանց դրանց admin-ը վերադարձնում է `403`։
- Միայն development build-ում `localhost`, `127.0.0.1` և `::1` հասցեներից `/admin` մուտքը թույլատրված է տեղային աշխատանքի համար։
- Գաղտնի տվյալները չեն պահվում Git repository-ում։
- Staging և production միջավայրերը մշակվելու են առանձին։
- Production փոփոխությունները կատարվելու են միայն հստակ հաստատումից հետո։
