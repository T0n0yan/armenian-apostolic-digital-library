# Բագեր

## Հիմա
- GPT QA ուղղումները պատրաստ են Claude-ի review-ին՝ `fix/gpt-qa-review`։ Զեկույց՝ [docs/qa/GPT-REVIEW.md](../qa/GPT-REVIEW.md)։ Staging/production չի հրապարակվել՝ ըստ տիրոջ պահանջի։

## Հերթ
- Telegram-ում Ղուկաս 4.31–41 գրառման տառասխալը ուղղում է տերը ինքը Telegram-ում (կայքը կթարմանա ինքնաբերաբար)։
- Story-ի 9:16 նկարով կիսվել (հրեշտակներ անկյուններում, ներքևում apostolic.am, «նկարով թե հղումով» հարց) — սպասում է դիզայնի համաձայնեցման։

## Արված
- 2026-11-11 — Խորքային audit և ուղղումներ՝ որոնում, հարցումների ծախս, մանրապատկերներ, SEO, հասանելիություն և CI բրաուզերային թեստեր ([#163](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/163), draft, դեռ չթողարկված)։ [Զեկույց](../qa/COMPREHENSIVE-AUDIT-2026-11-11.md)։
- 2026-11-08 — Ձայնագրություններ 270.8 → 110.2 ՄԲ (MP3 VBR, a1), Mini App-ի էջերի տվյալները cache-ից (անձնականը՝ /api/personal), թեթև ձևավորման նկարներ ([#142](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/142))։
- 2026-11-08 — Տեսանյութեր. առավելագույն սեղմում v2 (CRF 30, ձայն 40k/64k, −40% v1-ից), բոլորը նորից՝ բնօրինակից, բնօրինակները ջնջվում են ստուգումից անմիջապես հետո, նոր տեսանյութերը՝ ինքնաբերաբար նույն ձևով ([#139](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/139))։
- 2026-11-08 — QA/DevOps ստուգում և ուղղումներ ([զեկույց](../qa/SENIOR-AUDIT-2026-11.md), [#136](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/136))՝ արագություն հեռախոսում (ձայնագրություն մինչև «Լսել» չի բեռնվում, ներածությունը օրը մեկ անգամ, stale-while-revalidate cache, Smart Placement, 1200px նկարներ, սրբավայրերի փոքր պատկերներ), CI-ն կանաչ, deploy-ի smoke/rollback, maplibre 6, բրաուզերի սխալներ `/admin/usage`-ում։
- 2026-11-07 — Եկեղեցու հուշումը այլևս օրը մեկ անգամ չէ. ստուգվում է նաև կայք վերադառնալիս, փակելուց հետո՝ նորից 30 րոպեից, կա «Այսօր այլևս չհուշել» (`claude/ios-ui-bugs-70ydbm`)։
- 2026-11-07 — Եկեղեցու հուշումը՝ 200 մ շառավղով (ճշգրիտ դիրքով), տեքստում պահված հարցերը նույն մեղմ դեղին գույնով, ինչ պահված խոսքերը ([PR #128](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/128))։
- 2026-11-07 — iPhone-ում «Հուշել, երբ մոտ եմ եկեղեցուն»՝ քայլ առ քայլ օգնություն (Telegram-ում՝ կարգավորումները միանգամից), օգնության տեսանյութի պատուհանը այլևս չի փոքրանում/մեծանում, տառաչափը փոխվում է միանգամից (մենյուն փակելիս չէր կորչում), նշելու/ապանշելու ուղղումներ, որոնման «Իմ նշումները»-ում գտնված բառը նշված է ([PR #127](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/127))։
- 2026-11-03 — Սրբավայրի նկարների թռթռոցը ուղղված է, նկարները՝ WebP ([PR #100](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/100))։ Հին նկարները՝ /admin/places-ի կոճակով։
- 2026-11-03 — Քարտեզը drag չէր անում ուրվագծից դուրս (cursor-ը սովորական էր). քարտեզի container-ին `clip-path` էր դրված (Հայաստանի ձև), որը կտրում է նաև pointer events-ը։ Անցել է CSS `mask`-ի՝ նույն ուրվագիծը, բայց ամբողջ ուղղանկյունը մնում է քաշելի (`fix/map-mask-drag`)։

## Կարևոր մյուսների համար
- #163-ում օգնությունը միայն ընթերցողի ընտրությամբ է բացվում։ Հանրային cache-ի զուգահեռ հարցումները միավորվում են մեկ worker-ի և բազայի ներսում. անձնական տվյալների cache-ի սահմանները չեն փոխվել։
- Էջի loader-ը `.data` հարցման համար (կայքի ներսում նավարկելիս) ընթերցողին **չի կարդում** (`isPageDataRequest`). անձնական նոր դաշտ ավելացնելիս՝ `loadMaterialPersonal` / `loadCategoryPersonal`-ում (`/api/personal`), ոչ թե loader-ի ընդհանուր մասում, այլապես մեկի տվյալը cache-ով կհասնի մյուսին (թեստը կընկնի)։
- Տեսանյութերի սեղմման կանոնները՝ `shared/video-optimize.ts` (`VIDEO_PROFILE`)։ Փոխելիս արդեն սեղմվածները նորից կսեղմվեն միայն եթե բնօրինակը դեռ կա. 2026-11-08-ից բնօրինակները R2-ում չեն պահվում (Telegram-ինը մնում է Telegram-ում)։ Ձեռքով՝ Actions → Cloud sync → `video_only`, `video_limit`։
- Edge cache-ի բանալին՝ հասցե + `contentVersion` + Երևանի օր + build-ի տարբերակ (`workers/app.ts`)։ Գրադարանի էջերը 24 ժամ պահվում են և տրվում անմիջապես (stale-while-revalidate)։ Եթե էջը ցույց է տալիս մի բան, որը չի կախված գրառումներից կամ օրվանից (օր.՝ սրբավայրեր), այն մի դարձրեք `keepStale`։ Ամեն պատասխանում՝ `Server-Timing: edge;desc="hit|stale|miss|bypass"`։
- Deploy-ից հետո `scripts/smoke.mjs`. ձախողվելիս Worker-ը ինքն է վերադառնում նախորդ տարբերակին. migrations-ը միայն ավելացնող։
- Ձայնագրությունը `preload="none"` է (`material-media.tsx`). տևողությունը Telegram-ի տվյալից։ Ներածությունը օրը մեկ (`library-loader-day`)։
- Սրբավայրի փոքր նկար՝ `placeThumbUrl(key, 160|320)`. մեծ նկար՝ միայն էջում/պատկերասրահում։
- Բրաուզերի սխալները՝ `/admin/usage` → «Սխալներ ընթերցողների մոտ» (`client_errors`, migration 0051)։
- `lockScroll()` (`utils/scroll-lock.ts`) այժմ վերականգնում է միայն իր փոխած հատկությունները. նախկինում ամբողջ `<html>`-ի `style`-ը հետ դնելով ջնջում էր մենյուում փոխված `--reading-size`-ը։ `<html>`/`<body>`-ի inline ոճը ամբողջությամբ մի վերագրեք։
- Տեղորոշման սխալի բլոկը՝ `components/location-help.tsx` (`LocationHelp`). նոր տեղ, որտեղ դիրք է պետք, օգտագործեք այն։
- `<video>`-ին մի տվեք միայն `aspect-ratio` + `w-auto`. iPhone-ի Safari-ն մինչև բեռնվելը նրան 300×150 է դարձնում։ Տվեք շրջանակ (`div`) կոնկրետ բարձրությամբ, տեսանյութը՝ `absolute size-full object-contain`։
- Նկար վերբեռնելիս՝ `toWebp()` (`app/utils/image-webp.ts`). բրաուզերում WebP ≤1920px։ Worker-ում փոխարկել չենք կարող (անվճար պլանի CPU)։ Բոտից եկած նկարները JPEG են մնում, մինչև ադմինը սեղմի «Դարձնել WebP»։
- Cron-ը հիմա միայն գիշերային է (`17 0 * * *`)։ Սինքը և հիշեցումները ժամանակացույց են դնում `CLOCK` Durable Object-ի alarm-ով (`workers/clock.ts`)։ Production-ում `SYNC_ON_POSTS=1`. webhook-ը նոր գրառումից հետո սինք է պլանավորում 15 րոպե հետո։ Webhook-ը հիմա ստանում է նաև `edited_message` (գիշերային cron-ը ինքն է թարմացնում)։
- `reminders.channel` ('push' | 'calendar'), migration 0030։ Օրացույցով հիշեցումները սերվերը չի ուղարկում։
- Migration 0031՝ ինդեքս `library_materials(updated_at)`-ի վրա. `contentVersion`-ը (root loader) դրանից է հաշվում։ Վերնագրերի ինդեքսը՝ `/api/search-index?v=…`։ Service worker v5-ը պահում է էջերի տվյալները ըստ այդ տարբերակի. նոր նյութից հետո (մինչև 5 րոպե edge cache) հեռախոսները նորից են բերում։
- Ամսաթվերի համար `toLocaleString("hy-AM")` մի օգտագործեք (որոշ հեռախոսներում «M10» է). `app/utils/armenian-date.ts`-ի `formatDayMonth`, `formatClock`, `formatYerevanDateTime`։
- Workers Free-ում հարցման CPU-ն 10 մվ է. ծանր հաշվարկը տեղափոխեք D1 SQL կամ հեռախոս։
- Telegram-ում «փակ» թեման նշանակում է միայն, որ գրում են ադմինները. կայքում դա ընթերցողներին ցույց չի տրվում (միայն «թաքցված»-ն է նշվում)։
- MediaError code 4-ը Android WebView-ում հաճախ նշանակում է «ֆայլը չհասավ», ոչ թե ձևաչափ։
- Քարտեզի ուրվագիծը `clip-path`-ով մի տվեք. այն կտրում է նաև մկնիկի/մատի event-ները, ու ուրվագծից դուրս drag չի աշխատում։ Օգտագործեք CSS `mask` (`app/components/places-map.tsx`-ի `clip()`)՝ երևույթը նույնն է, բայց ամբողջ ուղղանկյունը մնում է ինտերակտիվ։
- Ամբողջ էկրանով նկար (lightbox) ցույց տալիս՝ `display:grid`-ով մի կենտրոնացրեք. percentage `max-height:100%`-ը auto grid-track-ում չի գործում ու բարձր նկարը արտահոսում է (կտրվում վերևից)։ Օգտագործեք `flex` + `object-contain` (`app/components/photo-gallery.tsx`)։
- `aspect-ratio`-ով տարրին `min-height` տալիս այն դառնում է նաև նվազագույն լայնություն (min-height × ratio)։ Grid/flex-ի մեջ ծնողին տվեք `min-width: 0` (կամ `grid-cols-[minmax(0,1fr)]`), այլապես նեղ էկրանին էջը լայնանում է ու աջից կպչում պատին։
- Նկարի շրջանակին, որը բեռնվում է, միշտ տվեք կայուն բարձրություն (և նվազագույն լայնություն), որ նկարը գալիս էջը չցատկի։
