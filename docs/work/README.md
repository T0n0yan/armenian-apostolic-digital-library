# Աշխատանքի բաժանում

Երեք չաթ, երեք ֆայլ։ Ամեն չաթ գործից առաջ աշխատեցնում է `node scripts/work-brief.mjs` (բոլոր ֆայլերի
կարճ ամփոփումը `origin/main`-ից, առանց «Արված»-ի) և թարմացնում միայն իրենը։ Կանոնները՝ `CLAUDE.md`։
Հին «Արված» տողերը՝ `archive/<չաթ>.md`-ում (ֆայլում մնում է վերջին 8-ը)։

| Չաթ | Ինչով է զբաղվում | Ֆայլ |
| --- | --- | --- |
| Բագեր | Այն, ինչ կոտրված է կայքում, Mini App-ում կամ բոտում | [bugs.md](bugs.md) |
| Նոր հնարավորություններ | Նոր էջեր, ֆունկցիաներ, դիզայն, բովանդակության գործիքներ | [features.md](features.md) |
| Ինտեգրացիաներ | Telegram խումբ և բոտ, BotFather, Google, Cloudflare, էլ. փոստ | [integrations.md](integrations.md) |

## Ընդհանուր որոշումներ (բոլորը պետք է իմանան)
- 2026-11-25 (տիրոջ որոշում). liquid glass-ը հանված է ամբողջ կայքից. մինիմալ «թղթե» մակերեսներ, առանց blur-ի (`docs/DESIGN.md` բաժին 2)։ Դասերը վերանվանված են. `frosted-card/panel` → `paper-card/panel`, `liquid-sheet/fab` → `paper-sheet/fab`, `glass-tile` → `menu-tile`, `glass-selected` → `chip-on`, `glass-arrow` → `sheet-arrow`, `border-glass-border` → `border-edge`, `bg-glass` → `bg-surface`, `animate-glass-enter` → `animate-rise-in`։ Թեման փոխվում է միանգամից (առանց View Transition)։
- 2026-11-03 (տիրոջ որոշում). ամեն փոփոխություն միանգամից production՝ PR → main, հետո նաև staging (որ երկուսը համընկնեն)։ Staging-ում սպասել և «թողարկիր» պետք չէ։ Deploy-ից հետո `scripts/smoke.mjs`-ը ստուգում է կայքը, ձախողվելիս Worker-ը ինքն է վերադառնում նախորդ տարբերակին։
- Հասցեները՝ `/psalms/22`, `/pray/71-…` (`app/utils/material-path.ts`). հին հասցեները (`/saghmosner/22`) 301-ով տանում են նորերին։
- Migrations-ը միայն ավելացնող (նոր աղյուսակ/սյուն). սյուն ջնջել կամ վերանվանել՝ երկու թողարկումով (`docs/ARCHITECTURE.md`)։
- `bash scripts/check.sh`-ը նույնն է, ինչ GitHub-ի «QA review»-ը (lint-ով). կարմիր QA-ով PR մի merge արեք։
- Կապի հասցե՝ info@apostolic.am (`app/utils/contact.ts`)։
- Այցելությունների վիճակագրությունը անանուն է, գաղտնիության էջում չի նշվում։
- Մեդիան՝ `media.apostolic.am` (R2), պահեստային՝ կայքի `/media/...`. նվագարկիչը ինքն է փորձում երկուսն էլ։
- Production բոտ՝ @armenian_apostolic_church_bot, staging-ի համար՝ հին բոտը։
- Production-ում ադմին է միայն t0n0yan.contact@gmail.com Google հաշիվը (մյուսները ավելացվում են /admin էջից)։
- Տոկենների խնայողություն (2026-11-03). ստուգում՝ միայն `bash scripts/check.sh`, աշխատանքի ֆայլեր՝ `node scripts/work-brief.mjs`, երկար ֆայլերից կարդալ միայն պետք եղած բաժինը, մեկ առաջադրանք՝ մեկ չաթ (`CLAUDE.md`, «Saving tokens»)։
