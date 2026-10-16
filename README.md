# Հայ Առաքելական Սուրբ Եկեղեցու թվային գրադարան

Telegram Mini App-first գրադարան։ Telegram-ը նյութերի և media-ի միակ մշտական source of truth-ն է։

## Architecture

```text
Telegram MTProto
      ↓
long-running Node.js Telegram Bridge (GramJS)
      ↓ authenticated internal HTTP
Cloudflare Worker / React Router loaders
      ↓
Mini App UI

D1 → users, bookmark references, category/topic/hashtag/post mappings, review state
```

Worker-ը և D1-ը Telegram post body կամ media bytes չեն պահում։ Video/audio/image request-երը Worker-ի private proxy route-ով stream են արվում Bridge-ից։ R2 binding չկա։

## Local mock mode

Առաջին terminal՝

```bash
pnpm install
pnpm bridge:mock
```

Երկրորդ terminal՝

```bash
cp .dev.vars.example .dev.vars
# .dev.vars-ում TELEGRAM_BRIDGE_SHARED_SECRET-ը դիր նույն local fixture արժեքը,
# որն օգտագործում է bridge:mock script-ը։
pnpm db:migrate:local
pnpm dev
```

Local URL՝ `http://127.0.0.1:5173/`։ Mock Bridge-ը լսում է `http://127.0.0.1:8788` հասցեում։

Եթե հին local-only 0010 migration-ը նախկինում արդեն կիրառված է, նախ export արա local D1-ը, հետո վերակառուցիր միայն local D1 state-ը։ Remote database-ի վրա reset մի կատարիր։

## Worker variables

| Name | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Telegram Mini App `initData` server-side validation |
| `TELEGRAM_BRIDGE_URL` | Internal HTTPS Bridge origin |
| `TELEGRAM_BRIDGE_SHARED_SECRET` | Worker → Bridge Bearer authentication |
| `CF_ACCESS_CLIENT_ID` | Optional Cloudflare Access service-token client ID; configure only with its secret |
| `CF_ACCESS_CLIENT_SECRET` | Optional Cloudflare Access service-token secret; configure only with its ID |
| `CF_ACCESS_TEAM_DOMAIN` | Optional Cloudflare Access issuer for `/admin` |
| `CF_ACCESS_AUD` | Optional Cloudflare Access audience |

Սրանք Worker secrets են և չունեն `VITE_` prefix։

## Telegram Bridge

Service-ը գտնվում է `services/telegram-bridge/`-ում և աշխատում է Node.js-ով։

`TELEGRAM_BOT_TOKEN`-ը միայն Mini App `initData` validation-ի և bot-ի գործող
ֆունկցիաների համար է։ MTProto history access-ը user session է և առանձին պահանջում
է `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION`։ Bot token-ը դրանց
փոխարինողը չէ։

Local authorization preparation՝

```bash
cp services/telegram-bridge/.env.example services/telegram-bridge/.env.local
# Լրացրու միայն TELEGRAM_API_ID և TELEGRAM_API_HASH։
pnpm telegram:authorize
```

Command-ը phone/code/2FA արժեքները կարդում է թաքցված interactive input-ով և
StringSession-ը atomic եղանակով պահում է նույն ignored `.env.local` ֆայլում՝ առանց
stdout-ում ցուցադրելու։ Նոր Telegram account չի ստեղծվում։

Session-ը ստուգելու և հասանելի group/supergroup/channel dialog metadata-ն միայն
read-only ցուցադրելու համար՝

```bash
pnpm telegram:discover-chats
```

Command-ը չի լրացնում `TELEGRAM_ALLOWED_CHAT_IDS`, history չի հարցնում և media չի
ներբեռնում։ Եթե local shared secret-ը դատարկ է, այն անվտանգ ստեղծվում և նույնացվում
է Bridge-ի `.env.local` ու Worker-ի `.dev.vars` ignored ֆայլերում։

Production adapter-ի variables՝

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `TELEGRAM_SESSION`
- `TELEGRAM_ALLOWED_CHAT_IDS`՝ comma-separated allowlist
- `TELEGRAM_BRIDGE_SHARED_SECRET`
- optional `TELEGRAM_MEDIA_CONCURRENCY`
- optional `TELEGRAM_MEDIA_TIMEOUT_MS`
- optional `TELEGRAM_REQUEST_CONCURRENCY`
- optional `TELEGRAM_REQUEST_TIMEOUT_MS`
- optional `TELEGRAM_SHUTDOWN_GRACE_MS`

Գործարկում՝

```bash
pnpm bridge:start
```

Bridge API՝

- `GET /health`
- `GET /ready`
- `GET /categories`
- `GET /categories/:slug/posts?cursor=...`
- `GET /posts/:chatId/:messageId`
- `GET /search?q=...&category=...&cursor=...`
- `GET|HEAD /media/:chatId/:messageId/:mediaIndex`

Բոլոր endpoints-ը պահանջում են service authentication։ Bridge-ը մերժում է allowlist-ից դուրս chat ID-ները։

Staging/production environment contract-ը, Docker deployment-ը, անվտանգ rollout-ը և
rollback-ը նկարագրված են [`docs/deployment-runbook.md`](docs/deployment-runbook.md)-ում։
Bridge image-ի local build command-ը՝

```bash
docker build -f services/telegram-bridge/Dockerfile -t telegram-bridge:local .
```

## Category mapping

Առաջնահերթությունը՝

1. forum topic ID,
2. configured hashtag,
3. exact Telegram chat/message admin mapping,
4. unclassified review։

Ցուցադրվող հայերեն անունները identifier չեն։ Stable արժեքներն են category ID/slug, chat ID, topic ID և message ID։

## D1

`0010_telegram_bridge_references.sql` migration-ը legacy content mirror-ը հեռացնում է և պահում միայն՝

- app users և admin role,
- bookmarks որպես `user_id + chat_id + message_id`,
- personal notes,
- topic/hashtag/post category mappings,
- review state։

## Verification

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

Tests-ը իրական Telegram credential չի օգտագործում։ 100+ MB video-ն virtual generated stream է և repository-ում մեծ fixture file չի պահվում։
