# Environments: production and staging

Two separate sites, each with its own database (D1), media bucket (R2) and settings.

| | Production | Staging |
| --- | --- | --- |
| Purpose | What readers use | Trying new things first |
| Address | https://armenian-apostolic-digital-library.armenian-apostolic-digital-library.workers.dev | https://armenian-apostolic-digital-library-staging.armenian-apostolic-digital-library.workers.dev |
| Worker | `armenian-apostolic-digital-library` | `armenian-apostolic-digital-library-staging` |
| D1 | `armenian-apostolic-digital-library-production` | `armenian-apostolic-digital-library-staging` |
| R2 | `armenian-apostolic-library-media-production` | `armenian-apostolic-library-media-staging` |
| Code | the `main` branch only | any feature branch |

Both read the same Telegram group, so they show the same materials. Readers' own data (saved
materials, notes, reminders, quiz answers, push subscriptions) is separate in each.

## How a change travels

1. Work on a feature branch; deploy it to **staging** and test there:

   ```bash
   CLOUDFLARE_ENV=staging pnpm run build && pnpm exec wrangler deploy --env staging
   ```

2. When it is right, open a pull request into `main` and merge it.
3. Deploy `main` to **production**:

   ```bash
   git checkout main && git pull
   CLOUDFLARE_ENV=production pnpm run build && pnpm exec wrangler deploy --env production
   ```

New database migrations go to staging first, then production:

```bash
pnpm exec wrangler d1 migrations apply armenian-apostolic-digital-library-staging --env staging --remote
pnpm exec wrangler d1 migrations apply armenian-apostolic-digital-library-production --env production --remote
```

Never deploy a feature branch to production.

## Telegram sync

`.github/workflows/cloud-sync.yml` syncs the Telegram group into both environments, one after the
other. Each Worker's per-minute cron starts it every 30 minutes when its `GITHUB_SYNC_TOKEN`
secret is set; GitHub's own schedule is a fallback.

## Settings per Worker

Variables live in `wrangler.jsonc`; secrets are set in the Cloudflare dashboard (Workers → the
Worker → Settings → Variables and Secrets) or with `wrangler secret put NAME --env <env>`.

| Secret | Production | Staging | What for |
| --- | --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | needed | set | Mini App sign-in, reminder messages, sharing |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | needed | set | Google sign-in |
| `VAPID_PRIVATE_JWK` | set | set | Browser notifications |
| `GITHUB_SYNC_TOKEN` | optional | set | Starting the sync every 30 minutes |

The Google client must list each site's `/auth/google/callback` address as an authorized
redirect URI.
