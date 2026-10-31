# Հոգևոր ժառանգություն — working rules for every Claude chat

The library site and Telegram Mini App for the group «Հայ Առաքելական Սուրբ Եկեղեցի»
(t.me/armenian_apostolic_church). Production: https://apostolic.am, staging: https://staging.apostolic.am.
How the pieces fit: `FUNCTIONALITY.md`, `docs/ENVIRONMENTS.md`.

## Talking to the owner

- Write **everything the owner sees in Armenian**: replies, next-step boxes, buttons, captions.
  Identifiers (names in code) stay English. Since 2026-10-31 (owner's decision): new code comments
  and commit messages are in Armenian, short and plain, so the owner can read them. The owner reads English poorly.
- Keep them informed in plain words; they want to see what is happening.

## Work is split between chats

Each chat has one lane and one work file in `docs/work/`:

| Chat | Lane | Its file |
| --- | --- | --- |
| Բագեր | Things that are broken on the site, Mini App or bot | `docs/work/bugs.md` |
| Նոր հնարավորություններ | New features, pages, design, content tools | `docs/work/features.md` |
| Ինտեգրացիաներ | Telegram group and bot settings, BotFather, Google, Cloudflare, email | `docs/work/integrations.md` |

`docs/work/README.md` is the shared overview (lanes, decisions everyone must know).

**Before starting any task:**
1. `git fetch origin` and read all four files in `docs/work/` from `origin/main`
   (`git show origin/main:docs/work/bugs.md`, …) — another chat may have changed something
   that affects you.
2. Put your task under "Հիմա" in **your own file** (one line: what, branch name).
3. If the task belongs to another lane, don't do it: add it to that lane's "Հերթ" list in your
   commit and tell the owner which chat should take it.

**After finishing:** move the line to "Արված" with the date and PR link, and note anything other
chats must know under "Կարևոր մյուսների համար". Edit only your own file (and README only for
shared decisions), so the chats never conflict.

## How changes travel (never skip)

1. Branch from the latest `origin/main`: `fix/…` for bugs, `feat/…` for features, `chore/…`
   for integrations.
2. Tests: `npx tsx --test tests/*.test.ts` and `npx tsc -b`. `git add` must include every
   changed directory (`app`, `workers`, `shared`, `migrations`, `tests`, `wrangler.jsonc`) —
   a missed `workers/app.ts` once broke the staging build.
3. Staging: `git checkout staging && git pull && git merge --no-edit <branch> && git push`.
   Never force-push `staging` or `main`; other chats merge there too. If the push trigger lags,
   `gh workflow run deploy.yml --ref staging`. Check the result on staging.apostolic.am.
4. **Production only after the owner writes «թողարկիր».** Then a PR from your branch into
   `main`, merge it, watch the deploy, check apostolic.am.
5. Docs-only changes (`*.md`, `docs/**`) don't trigger deploys.

## Safety

- Never type passwords, tokens or codes for the owner and never ask them to send one; they enter
  secrets in dashboards themselves. Keep the Google client-secret JSON out of the repo.
- Ask before BotFather changes, Telegram group setting changes, remote D1 writes outside
  migrations, and anything visible to group members.
- Visit statistics are anonymous by design (no account linked); keep them that way.
- Church content: never present it as verified; mark doubtful facts «⚑ Ճշտել» for clergy review.
