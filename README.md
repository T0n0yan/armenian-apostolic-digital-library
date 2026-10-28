# Հայ Առաքելական Սուրբ Եկեղեցու թվային գրադարան

Telegram Mini App-first գրադարան։ Telegram-ը սկզբնաղբյուրն է։ GitHub Actions-ը նյութերը ներմուծում է D1, իսկ մեդիան՝ R2/CDN։

## Architecture

```text
Telegram MTProto → GitHub Actions (cloud-sync) → D1 + R2
                                                    ↓
                          Cloudflare Worker / React Router → կայք / Mini App
                          R2 custom domain / CDN           → աուդիո և նկարներ

D1 → գրադարան, օգտատերեր, պահված նյութեր, հիշեցումներ, սրբավայրեր
```

Ընթերցողների հարցումները մատուցվում են D1/R2-ից՝ առանց մշտական Telegram Bridge-ի։ Հիմնական մեդիան ուղիղ CDN-ից է, Worker-ի /media երթուղին պահեստային տարբերակն է։ Տեղական մշակման համար առկա է նաև mock Bridge։

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
| `CF_ANALYTICS_ACCOUNT_ID` | Cloudflare հաշվի ID՝ գլխավոր ադմինի օգտագործման վահանակի համար |
| `CF_ANALYTICS_TOKEN` | Միայն ընթերցման Analytics API token՝ Worker secret |

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
- `TELEGRAM_CONTENT_CHAT_ID`՝ տվյալ environment-ի միակ active content forum-ը։ Այն
  պետք է ներառված լինի allowlist-ում։ Մեկ-chat allowlist-ի դեպքում այդ միակ արժեքը
  backward-compatible fallback է, իսկ բազմաչատ allowlist-ը պահանջում է explicit արժեք։
- `TELEGRAM_BRIDGE_SHARED_SECRET`
- optional `TELEGRAM_MEDIA_CONCURRENCY`
- optional `TELEGRAM_MEDIA_QUEUE_LIMIT`
- optional `TELEGRAM_MEDIA_PER_ASSET_CONCURRENCY`
- optional `TELEGRAM_MEDIA_PER_CLIENT_CONCURRENCY`
- optional `TELEGRAM_MEDIA_RANGE_WINDOW_BYTES` (defaults to a 2 MiB window for open-ended browser ranges)
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

Search-ը deterministic է և AI provider չի օգտագործում։ Bridge-ը lazy կերպով կառուցում է
default 10,000 Telegram material / 20,000,000 searchable character պարունակող
memory-only index։ Configurable hard ceiling-ները համապատասխանաբար 50,000 և
100,000,000 են։ Default TTL-ը 30 վայրկյան է, նույն build-ի concurrent request-ները
deduplicate են արվում, իսկ restart-ից հետո index-ը նորից է կառուցվում Telegram-ից։
Index-ը disk/D1/R2 content mirror չէ։ Նոր, խմբագրված և ջնջված նյութերը երևում են
հաջորդ TTL refresh-ից հետո։ Սահմանները server-only
`TELEGRAM_SEARCH_INDEX_MAX_DOCUMENTS` և `TELEGRAM_SEARCH_INDEX_MAX_CHARACTERS`
environment variables-ով կարող են միայն նվազեցվել սահմանափակ runtime-ների համար։

D1-ի `search_query_aggregates` table-ը պահում է միայն server-keyed HMAC-SHA-256 query key, scope,
day bucket և aggregate counters։ Query text, user ID, IP, initData, note կամ Telegram
body չի պահվում։ 90 օրից հին bucket-ները մաքրվում են opportunistic cleanup-ով։

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

Անվճար պլանի օպտիմալացման փոփոխություններն ու կարգավորումը՝ [հանձնման հաշվետվություն](docs/qa/FREE-TIER-REVIEW.md)։
