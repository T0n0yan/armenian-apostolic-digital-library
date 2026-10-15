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
| `CF_ACCESS_TEAM_DOMAIN` | Optional Cloudflare Access issuer for `/admin` |
| `CF_ACCESS_AUD` | Optional Cloudflare Access audience |

Սրանք Worker secrets են և չունեն `VITE_` prefix։

## Telegram Bridge

Service-ը գտնվում է `services/telegram-bridge/`-ում և աշխատում է Node.js-ով։

Production adapter-ի variables՝

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `TELEGRAM_SESSION`
- `TELEGRAM_ALLOWED_CHAT_IDS`՝ comma-separated allowlist
- `TELEGRAM_BRIDGE_SHARED_SECRET`
- optional `TELEGRAM_MEDIA_CONCURRENCY`
- optional `TELEGRAM_MEDIA_TIMEOUT_MS`

Գործարկում՝

```bash
pnpm bridge:start
```

Bridge API՝

- `GET /health`
- `GET /categories`
- `GET /categories/:slug/posts?cursor=...`
- `GET /posts/:chatId/:messageId`
- `GET /search?q=...&category=...&cursor=...`
- `GET|HEAD /media/:chatId/:messageId/:mediaIndex`

Բոլոր endpoints-ը պահանջում են service authentication։ Bridge-ը մերժում է allowlist-ից դուրս chat ID-ները։

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
