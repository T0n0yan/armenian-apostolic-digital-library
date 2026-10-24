# Environments: production and staging

Two separate sites, each with its own database (D1), media bucket (R2) and settings.

| | Production | Staging |
| --- | --- | --- |
| Purpose | What readers use | Trying new things first |
| Address | https://apostolic.am | https://staging.apostolic.am |
| Worker | `armenian-apostolic-digital-library` | `armenian-apostolic-digital-library-staging` |
| D1 | `armenian-apostolic-digital-library-production` | `armenian-apostolic-digital-library-staging` |
| R2 | `armenian-apostolic-library-media-production` | `armenian-apostolic-library-media-staging` |
| Code | the `main` branch only | any feature branch |

Both read the same Telegram group, so they show the same materials. Readers' own data (saved
materials, notes, reminders, quiz answers, push subscriptions) is separate in each.

The old `…workers.dev` addresses and `www.apostolic.am` redirect to these (workers/app.ts).
The domain is registered at name.am; its DNS is on Cloudflare.

## How a change travels

Deploys run on GitHub Actions (`.github/workflows/deploy.yml`) on every push:

| Branch | Deploys to |
| --- | --- |
| `staging` | staging |
| `main` | production |

1. Work on a feature branch and open a pull request into `staging`. Merging it deploys staging
   (tests → migrations → build → deploy).
2. When staging is right, open a pull request from `staging` into `main`. Merging it deploys
   production the same way.

Each deploy applies that environment's new D1 migrations before the new code goes live, so a
migration must keep working with the code still running until the deploy finishes.

Never push straight to `main`. Manual deploys are still possible for emergencies:

```bash
CLOUDFLARE_ENV=staging pnpm run build && pnpm exec wrangler deploy --env staging
```

The workflow uses the `CLOUDFLARE_API_TOKEN` secret (Workers Scripts: Edit, D1: Edit, R2: Edit)
and the `CLOUDFLARE_ACCOUNT_ID` variable of the repository.

## Telegram sync

`.github/workflows/cloud-sync.yml` syncs the Telegram group into both environments, one after the
other. Production's bot is an admin in the group, so its webhook sees every new or edited post:
each one sets the Worker's Clock (a Durable Object, `workers/clock.ts`) 15 minutes ahead, and the
sync starts once, 15 minutes after the last post (needs the `GITHUB_SYNC_TOKEN` secret). A cron once
a night (00:17 UTC) starts a full sync too, since Telegram doesn't announce deleted posts; GitHub's
own daily schedule is a fallback. Nothing runs every minute any more (each wake-up counts against
the free plan's 100,000 requests a day).

Reminders sent by the server (the bot's message, phone notifications) wake the same Clock at their
own minute; reminders the reader put in the phone's calendar are never sent by the server.

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
