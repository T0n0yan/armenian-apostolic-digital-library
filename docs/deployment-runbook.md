# Test/staging deployment runbook

Այս runbook-ը նախապատրաստում է deployment-ը, բայց ինքնուրույն ոչինչ չի deploy անում։
`staging` և `production` միջավայրերը նույն application code/image-ն են օգտագործում և
տարբերվում են միայն bindings-ով, secrets-ով ու Telegram configuration-ով։

## Architecture և runtime սահմաններ

```text
Telegram MTProto
  ↕ persistent connection
always-on Node.js Telegram Bridge (GramJS, HTTPS, authenticated)
  ↕ streamed HTTP / Range
Cloudflare Worker + React Router SSR
  ↕
Mini App UI                 D1 (app-only state/references)
```

- Mini App/SSR-ը deploy է արվում Cloudflare Worker-ում՝ `wrangler.jsonc`-ի
  `workers/app.ts` entrypoint-ով։
- `DB` binding-ը staging-ում և production-ում կապված է տարբեր D1 database-ների։
- Bridge-ը Node.js 22 long-running process է։ Այն պահում է MTProto connection-ը և
  reconnect state-ը process lifecycle-ի ընթացքում, իսկ StringSession-ը ստանում է
  միայն hosting secret store-ից։
- GramJS-ը Worker-ի ներսում չի աշխատեցվում. Worker invocation-ը request-scoped է,
  իսկ outbound TCP socket-ը չի կարելի global scope-ում պահել կամ request-ների միջև
  կիսել։ Persistent updates/reconnect և երկար media stream-երի համար անհրաժեշտ է
  առանձին always-on Node service։
- Telegram post/media-ն D1-ում, R2-ում կամ Bridge disk-ում չի mirror արվում։

## Environment contract

Tracked, դատարկ օրինակները գտնվում են `deployment/` պանակում։ Լրացված տարբերակները
պետք է լինեն միայն hosting/Cloudflare secret store-ում կամ ignored local ֆայլերում։

| Scope | Required values |
|---|---|
| staging Bridge | `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION`, `TELEGRAM_ALLOWED_CHAT_IDS`, `TELEGRAM_BRIDGE_SHARED_SECRET` |
| staging Worker | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BRIDGE_URL`, `TELEGRAM_BRIDGE_SHARED_SECRET`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` |
| staging platform | `DB` → staging D1, test Mini App public HTTPS URL |
| production Bridge | նույն անուններով առանձին production values |
| production Worker | նույն անուններով առանձին production values |
| production platform | `DB` → production D1, main Mini App public HTTPS URL |

Staging Bridge allowlist-ը պետք է ունենա միայն հաստատված test forum chat ID-ն։
Production allowlist/session արժեքները staging deploy-ի մաս չեն։ Shared secret-ի
արժեքը նույն environment-ի Worker-ում և Bridge-ում նույնն է, բայց environments-ի
միջև տարբեր է։ Որևէ secret `VITE_` prefix չունի։

## Bridge hosting տարբերակներ

| Տարբերակ | Always-on/session | HTTPS/private access | Sleep/cold start | Բարդություն | Պիտանիություն |
|---|---|---|---|---|---|
| Փոքր VPS + Docker + Caddy/systemd | Այո, secret store/env file և restart policy | Caddy HTTPS, firewall կամ Cloudflare Tunnel | Չկա | Միջին՝ OS updates, backup, monitoring | Առաջարկվող staging և production-ի համար. կանխատեսելի streaming և ցածր հաստատուն արժեք |
| Railway/Render/Fly.io paid always-on service | Այո, եթե sleep/autostop անջատված է և secrets-ը platform store-ում են | Managed HTTPS/private networking՝ provider-ից կախված | Free/serverless tiers-ում sleep կամ cold start հնարավոր է | Ցածր–միջին, բայց bandwidth/egress billing-ը պետք է հսկել | Լավ staging, ընդունելի production՝ միայն paid always-on կարգավորմամբ |
| Local Bridge + named Cloudflare Tunnel | Process-ը միայն local մեքենայի uptime-ի չափով | Tunnel-ը outbound-only HTTPS է | Laptop sleep/restart-ը կանգնեցնում է service-ը | Ցածր սկզբնական, բարձր օպերացիոն փխրունություն | Միայն կարճ test. production-ի կամ կայուն media streaming-ի համար ոչ |

Առաջարկը՝ նույն Docker image-ը փոքր VPS-ում՝ առանձին staging/production
containers և secret files/provider secret store։ Սա պահպանում է Node process-ը,
կանխատեսելի է մեծ video/audio Range streaming-ի համար և test→production անցման
ժամանակ code/image փոփոխություն չի պահանջում։ Սկզբում կարելի է deploy անել միայն
staging container-ը։

## Security և lifecycle

- Բոլոր Bridge endpoints-ը, ներառյալ `/health` և `/ready`, պահանջում են Bearer
  shared secret։ Comparison-ը SHA-256 digest-ների constant-time համեմատություն է։
- Adapter կանչից առաջ chat ID-ն ստուգվում է `TELEGRAM_ALLOWED_CHAT_IDS` allowlist-ով։
- Metadata request timeout-ը և ընդհանուր request concurrency-ն սահմանվում են
  `TELEGRAM_REQUEST_TIMEOUT_MS`/`TELEGRAM_REQUEST_CONCURRENCY`-ով։ Media-ի համար
  առանձին timeout/concurrency կա։ Client disconnect-ը abort է անում Telegram stream-ը։
- Internet-facing reverse proxy-ում ավելացնել per-origin rate limit, request/header
  size limits և TLS։ IP-only allowlist-ը բավարար չէ փոփոխվող Worker egress IP-ների
  պատճառով. shared secret-ը մնում է պարտադիր։ Overload-ը վերադարձնում է `503`։
- Logs-ում պահել միայն status/latency/error class. չգրել Authorization header,
  session, token, API hash, query text, message body կամ media URL։
- Cloudflare Vite-ի local `.dev.vars` պատճենները `postbuild`-ով մաքրվում են generated
  `build/` output-ից. local source file-ը մնում է ignored և container context չի մտնում։
- `/health` liveness է, `/ready` readiness. երկուսն էլ ստուգվում են secret header-ով։
- `SIGTERM`/`SIGINT`-ին readiness-ը դառնում է false, server-ը դադարեցնում է նոր
  connections-ը, սպասում է ընթացիկ streams-ին, հետո grace timeout-ից հետո փակում է
  connections-ը և MTProto adapter-ը։
- Session rotation՝ local authorization-ով ստեղծել նոր StringSession, secret store-ում
  atomically փոխել `TELEGRAM_SESSION`, restart անել Bridge-ը, ստուգել `/ready`, ապա
  Telegram Settings → Devices-ում revoke անել հին session-ը։ Leak-ի դեպքում նախ revoke,
  հետո նոր session deploy։ Shared secret rotation-ը կատարել Bridge-ում, readiness-ից
  հետո Worker-ում, իսկ անցման ընթացքում օգտագործել կարճ maintenance window։

## Staging rollout — միայն հաջորդ հաստատված փուլում

Ստորև նշված state-changing քայլերը այս audit-ի ընթացքում չեն գործարկվում։

1. Build և publish անել Bridge container-ը, ապա staging host-ի secret store-ում
   լրացնել `deployment/staging.bridge.env.example`-ի արժեքները։ Production values չօգտագործել։
2. Գործարկել մեկ always-on staging Bridge instance restart policy-ով և HTTPS reverse
   proxy-ով։ Container healthcheck-ը կանչում է authenticated `/ready` endpoint-ը։
3. Local terminal-ից ստուգել authenticated HTTPS endpoints-ը՝ secret-ը shell history-ում
   չդնելով.

   ```bash
   read -rs CF_ACCESS_CLIENT_ID
   read -rs CF_ACCESS_CLIENT_SECRET
   read -rs TELEGRAM_BRIDGE_SHARED_SECRET
   export CF_ACCESS_CLIENT_ID CF_ACCESS_CLIENT_SECRET TELEGRAM_BRIDGE_SHARED_SECRET
   node -e "const h={'CF-Access-Client-Id':process.env.CF_ACCESS_CLIENT_ID,'CF-Access-Client-Secret':process.env.CF_ACCESS_CLIENT_SECRET,authorization:'Bearer '+process.env.TELEGRAM_BRIDGE_SHARED_SECRET};fetch(process.env.TELEGRAM_BRIDGE_URL+'/health',{headers:h}).then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"
   node -e "const h={'CF-Access-Client-Id':process.env.CF_ACCESS_CLIENT_ID,'CF-Access-Client-Secret':process.env.CF_ACCESS_CLIENT_SECRET,authorization:'Bearer '+process.env.TELEGRAM_BRIDGE_SHARED_SECRET};fetch(process.env.TELEGRAM_BRIDGE_URL+'/ready',{headers:h}).then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"
   unset CF_ACCESS_CLIENT_ID CF_ACCESS_CLIENT_SECRET TELEGRAM_BRIDGE_SHARED_SECRET
   ```

4. Նախ read-only տեսնել staging D1 migration վիճակը.

   ```bash
   pnpm exec wrangler d1 migrations list armenian-apostolic-digital-library-staging --remote --env staging
   ```

5. Հաստատումից հետո կիրառել միայն staging migrations-ը.

   ```bash
   pnpm db:migrate:staging
   ```

6. Staging Worker secrets-ը դնել interactive stdin-ով (արժեքները command argument չեն).

   ```bash
   pnpm exec wrangler secret put TELEGRAM_BOT_TOKEN --env staging
   pnpm exec wrangler secret put TELEGRAM_BRIDGE_URL --env staging
   pnpm exec wrangler secret put TELEGRAM_BRIDGE_SHARED_SECRET --env staging
   pnpm exec wrangler secret put CF_ACCESS_CLIENT_ID --env staging
   pnpm exec wrangler secret put CF_ACCESS_CLIENT_SECRET --env staging
   ```

7. Deploy անել միայն staging Worker-ը և browser-ով ստուգել home/topic/material/media
   route-երը՝ մինչ Telegram URL փոխելը.

   ```bash
   pnpm deploy:staging
   ```

8. Գրանցել գործող test bot-ի ներկայիս Mini App URL-ը rollback-ի համար։ `@BotFather`-ում
   բացել `/mybots` → գործող test bot → Bot Settings → Menu Button → Configure menu button,
   ընտրել նույն menu button-ը և տալ նոր staging HTTPS URL-ը։ Նոր bot չստեղծել։
9. Telegram Desktop և mobile-ում փակել/վերաբացել Mini App-ը, ստուգել initData auth,
   topic list/detail, search, bookmark, photo/album/poll/location և video/audio seek։
10. Խնդրի դեպքում նույն BotFather ճանապարհով անմիջապես վերականգնել նախապես գրանցված
    հին URL-ը։ Եթե backend rollback է պետք, նախ Worker-ը վերադարձնել նախորդ deployment-ին,
    հետո Bridge container-ը նախորդ image tag-ին։ D1 rollback-ը կատարել միայն forward
    corrective migration-ով կամ նախապես վերցված export-ից՝ առանձին հաստատմամբ։

## Production promotion checklist

- [ ] Նույն commit-ի նույն tested container image/Worker bundle-ը ընտրել։
- [ ] Production Bridge secret store-ում դնել առանձին API/session/allowlist/shared secret։
- [ ] `TELEGRAM_ALLOWED_CHAT_IDS`-ում դնել միայն հաստատված production chat ID-ն։
- [ ] Production Worker-ում դնել main bot token-ը և production Bridge URL/shared secret-ը։
- [ ] `wrangler.jsonc`-ի production `DB` binding-ը թողնել production D1-ին կապված։
- [ ] Նախ ստուգել migration list-ը, backup/export-ը և միայն հաստատմամբ apply անել migrations-ը։
- [ ] Deploy անել production Bridge, ապա authenticated health/readiness ստուգել։
- [ ] Deploy անել Worker-ը և direct HTTPS smoke test անել։
- [ ] Վերջում միայն main bot-ի Mini App URL-ը փոխել՝ հին URL-ը պահելով rollback-ի համար։
- [ ] Refresh-ից ստուգել dynamic production topics-ը. topic ID/title/content type ձեռքով չտեղափոխել։

Topic-ները և նյութերը ամեն environment-ի allowlisted Telegram group-ից հայտնաբերվում
են runtime-ում։ Test→production promotion-ը source code, topic mapping կամ UI փոփոխություն
չի պահանջում։
