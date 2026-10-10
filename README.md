# Հայ Առաքելական Սուրբ Եկեղեցու թվային գրադարան

Telegram Mini App-first թվային գրադարան՝ խմբի նյութերի որոնման, նավիգացիայի, անձնական պահպանման և հետագայում սրբավայրերի քարտեզի համար։

## Տեխնիկական հիմք

- TypeScript
- React 19
- React Router 8՝ server-side rendering-ով
- Cloudflare Workers
- Cloudflare D1՝ հաջորդ փուլում
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

## Անվտանգության սկզբունքներ

- Հավելվածը Telegram խմբում չի հրապարակում, չի խմբագրում և չի ջնջում հաղորդագրություններ։
- Գաղտնի տվյալները չեն պահվում Git repository-ում։
- Staging և production միջավայրերը մշակվելու են առանձին։
- Production փոփոխությունները կատարվելու են միայն հստակ հաստատումից հետո։
