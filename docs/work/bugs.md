# Բագեր

## Հիմա
- GPT QA ուղղումները պատրաստ են Claude-ի review-ին՝ `fix/gpt-qa-review`։ Զեկույց՝ [docs/qa/GPT-REVIEW.md](../qa/GPT-REVIEW.md)։ Staging/production չի հրապարակվել՝ ըստ տիրոջ պահանջի։

## Հերթ
- Telegram-ում Ղուկաս 4.31–41 գրառման տառասխալը ուղղում է տերը ինքը Telegram-ում (կայքը կթարմանա ինքնաբերաբար)։
- Story-ի 9:16 նկարով կիսվել (հրեշտակներ անկյուններում, ներքևում apostolic.am, «նկարով թե հղումով» հարց) — սպասում է դիզայնի համաձայնեցման։

## Արված
- 2026-10-21 — Android/Telegram-ում աուդիոյի «ձևաչափը չի աջակցվում» սխալը՝ իրականում բեռնման խափանում. ավելացվեց պահեստային հասցե, կրկնակի փորձ, ճիշտ հաղորդագրություն ([#20](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/20))։
- 2026-10-22 — Սխալի էջեր (404/403/500/503), /admin առանց իրավունքի → գլխավոր էջ ([#21](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/21))։
- 2026-10-23 — 404 էջի ներդիրում մեկ ճիշտ վերնագիր («Էջը չի գտնվել») ([#24](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/24))։
- 2026-10-23 — Ծանուցումներ. հետին պլանում բաց հավելվածն այլևս չի «կլանում» հիշեցումը (սերվերը ուղարկում է հեռախոսին), «1 րոպեից»-ը զանգում է, «Կարդացել եմ»-ը և հետաձգումը այլևս հետ չեն գալիս ([#24](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/24))։
- 2026-10-23 — Նյութերի նկարները միանգամից լրիվ որակով, սեղմելիս՝ ամբողջ էկրանով («Ամբողջ չափով» կոճակը հանված է) ([#24](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/24))։
- 2026-10-23 — Փակ Telegram թեմաների «փակված» նշումը հանված է կայքից ([#24](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/24))։

- 2026-10-24 — Որոնման 503 (Workers Free-ի 10 մվ CPU). որոնումը FTS-ով ու միայն «→»/Enter-ով, առանց նախնական բեռնման, «ով է կայքում»-ը սարքից մեկ անգամ ([#42](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/42))։
- 2026-10-24 — Ամեն րոպեի cron-ը հանված է. սինքը՝ նոր գրառումից 15 րոպե հետո, հիշեցումները՝ ճիշտ ժամին (Clock Durable Object), հիշեցում հեռախոսի օրացույցով կամ ծանուցումով ([#43](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/43))։
- 2026-10-24 — /admin/people. գրանցվածների և անանուն սարքերի ցուցակ, որոնում, Excel ([#44](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/44))։
- 2026-10-24 — Վերնագրերի որոնում հեռախոսում (առանց հարցման), անգլերեն/ռուսերեն բառեր, էջերը պահվում են հեռախոսում մինչև նոր նյութ ([#45](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/45))։
- 2026-10-24 — Աղոթքների տառաչափը աշխատում է, «Օրվա համարը»-ի և «Սարքի պես» թեմայի փոփոխությունները՝ միանգամից, ամսաթվերը՝ հայերեն ամսանուններով («M10»-ի փոխարեն) ([#47](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/47))։

## Կարևոր մյուսների համար
- Cron-ը հիմա միայն գիշերային է (`17 0 * * *`)։ Սինքը և հիշեցումները ժամանակացույց են դնում `CLOCK` Durable Object-ի alarm-ով (`workers/clock.ts`)։ Production-ում `SYNC_ON_POSTS=1`. webhook-ը նոր գրառումից հետո սինք է պլանավորում 15 րոպե հետո։ Webhook-ը հիմա ստանում է նաև `edited_message` (գիշերային cron-ը ինքն է թարմացնում)։
- `reminders.channel` ('push' | 'calendar'), migration 0030։ Օրացույցով հիշեցումները սերվերը չի ուղարկում։
- Migration 0031՝ ինդեքս `library_materials(updated_at)`-ի վրա. `contentVersion`-ը (root loader) դրանից է հաշվում։ Վերնագրերի ինդեքսը՝ `/api/search-index?v=…`։ Service worker v5-ը պահում է էջերի տվյալները ըստ այդ տարբերակի. նոր նյութից հետո (մինչև 5 րոպե edge cache) հեռախոսները նորից են բերում։
- Ամսաթվերի համար `toLocaleString("hy-AM")` մի օգտագործեք (որոշ հեռախոսներում «M10» է). `app/utils/armenian-date.ts`-ի `formatDayMonth`, `formatClock`, `formatYerevanDateTime`։
- Workers Free-ում հարցման CPU-ն 10 մվ է. ծանր հաշվարկը տեղափոխեք D1 SQL կամ հեռախոս։
- Telegram-ում «փակ» թեման նշանակում է միայն, որ գրում են ադմինները. կայքում դա ընթերցողներին ցույց չի տրվում (միայն «թաքցված»-ն է նշվում)։
- MediaError code 4-ը Android WebView-ում հաճախ նշանակում է «ֆայլը չհասավ», ոչ թե ձևաչափ։
