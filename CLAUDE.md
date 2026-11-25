# Apostolic.am — working rules for every Claude chat

The library site and Telegram Mini App for the group «Հայ Առաքելական Սուրբ Եկեղեցի»
(t.me/armenian_apostolic_church). Production: https://apostolic.am, staging: https://staging.apostolic.am.
How the pieces fit: `docs/ARCHITECTURE.md` (diagrams of everything), `docs/ENVIRONMENTS.md`.
Read them only when the task needs it, and only the needed section (see "Saving tokens").
**Whenever you add or change a feature, page, table, workflow or service, update `docs/ARCHITECTURE.md`
in the same branch**, then rebuild the interactive page with `node scripts/build-architecture-page.mjs`
(it writes `docs/architecture.html`; never read or edit the HTML by hand). The owner reads it to understand the site.
**Design rules** (radius scale, surfaces, fields, button groups): `docs/DESIGN.md` — follow them for any UI change.

## Talking to the owner

- Write **everything the owner sees in Armenian**: replies, next-step boxes, buttons, captions.
  Identifiers (names in code) stay English. Since 2026-10-31 (owner's decision): new code comments
  and commit messages are in Armenian, short and plain, so the owner can read them. The owner reads English poorly.
- Keep them informed in plain words; they want to see what is happening.
- **Owner's decision (2026-11-25): every design change, even the smallest (color, spacing, icon, ornament,
  animation, layout), is first described to the owner and done only after they agree.** Bug fixes that
  don't change the look go straight on; if a fix changes how something looks, ask first.

## Work is split between chats

Each chat has one lane and one work file in `docs/work/`:

| Chat | Lane | Its file |
| --- | --- | --- |
| Բագեր | Things that are broken on the site, Mini App or bot | `docs/work/bugs.md` |
| Նոր հնարավորություններ | New features, pages, design, content tools | `docs/work/features.md` |
| Ինտեգրացիաներ | Telegram group and bot settings, BotFather, Google, Cloudflare, email | `docs/work/integrations.md` |

`docs/work/README.md` is the shared overview (lanes, decisions everyone must know).

**Before starting any task:**
1. Run `node scripts/work-brief.mjs` — it fetches `origin/main` and prints README plus every lane's
   "Հիմա", "Հերթ" and "Կարևոր մյուսների համար" (another chat may have changed something that
   affects you). It skips the "Արված" history; use `--all` only if you really need it.
2. Put your task under "Հիմա" in **your own file** (one line: what, branch name).
3. If the task belongs to another lane, don't do it: add it to that lane's "Հերթ" list in your
   commit and tell the owner which chat should take it.

**After finishing:** move the line to "Արված" with the date and PR link, and note anything other
chats must know under "Կարևոր մյուսների համար". Edit only your own file (and README only for
shared decisions), so the chats never conflict. Keep "Արված" to the latest 8 lines: move older ones
to the top of `docs/work/archive/<lane>.md`. Permanent facts (tables, routes, how things work)
belong in `docs/ARCHITECTURE.md`; keep "Կարևոր մյուսների համար" for short, current notes.

## How changes travel (never skip)

1. Branch from the latest `origin/main`: `fix/…` for bugs, `feat/…` for features, `chore/…`
   for integrations.
2. Checks: `bash scripts/check.sh` (installs deps, typegen, build, tests, `tsc -b`; prints one line
   when green, only the failing tail otherwise). Don't run the raw commands: in a fresh container they
   fail without build/typegen and dump 30–70 KB of noise. `git add` must include every
   changed directory (`app`, `workers`, `shared`, `migrations`, `tests`, `wrangler.jsonc`) —
   a missed `workers/app.ts` once broke the staging build.
3. **Owner's decision (2026-11-03): every change goes straight to production.** No staging review
   step and no waiting for «թողարկիր»: PR from your branch into `main`, merge it, watch the deploy,
   check apostolic.am. Then also merge the branch into `staging` (`git checkout staging && git pull &&
   git merge --no-edit <branch> && git push`), so both stay in sync. Never force-push `staging` or `main`.
4. If the push trigger lags, `gh workflow run deploy.yml --ref main`.
5. Docs-only changes (`*.md`, `docs/**`) don't trigger deploys.

## Saving tokens (the owner's weekly limit runs out)

Same work, smaller context. Armenian text costs several times more tokens than English.
- Long files: find the place first (`grep -n "^## " docs/ARCHITECTURE.md`, `grep -n`), then read
  only that range (Read with offset/limit). Don't re-read a file you already have in context.
- Long command output: always cut it (`| tail -n 30`, `--stat`, `--oneline`, `-q`, `--reporter=silent`).
  `git diff --stat` before a full diff; a full diff only for the files you need.
- No subagents (Agent/Explore) unless the owner asks: each one starts from zero and re-reads everything.
- One task per chat. After the task is released, tell the owner to open a new chat for the next one.

## Safety

- Never type passwords, tokens or codes for the owner and never ask them to send one; they enter
  secrets in dashboards themselves. Keep the Google client-secret JSON out of the repo.
- Ask before BotFather changes, Telegram group setting changes, remote D1 writes outside
  migrations, and anything visible to group members.
- Visit statistics are anonymous by design (no account linked); keep them that way.
- Church content: never present it as verified; mark doubtful facts «⚑ Ճշտել» for clergy review.
