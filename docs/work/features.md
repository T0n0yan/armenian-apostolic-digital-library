# Նոր հնարավորություններ

## Հիմա
- Սաղմոսի համարի պատուհան (Պատճենել / Կիսվել / Պահել / ▶ Լսել այստեղից) և համարի էջ `/saghmosner/22/3` — `feat/verse-popup`, staging-ում ստուգման։
- Տիրոջ դիտողությունները (նույն `feat/verse-popup` ճյուղում)՝
  - Մուտքի կոճակները լայն էկրանին գեղեցիկ չեն. մուտք նաև կայքի մենյուի ներքևում։
  - Ստորագիրը («Մեր մասին · Կապ · Գաղտնիություն»)՝ ավելի աննկատ և ցածր։
  - Սաղմոսների համարների սալիկները՝ ավելի փոքր։
  - «Հարցեր Աստվածաշնչից»՝ հավասար բարձրության քարտեր, «4 պատասխան»-ի փոխարեն ավելի իմաստալից տեսք։
  - «Սրբերի վարքը», «Ավետարանի ուսուցում», «Օրվա ընթերցումներ» բաժինների նկարագրությունները։
  - Համարի պատուհան. «Պատճենել»՝ ✓ անիմացիա և փակվել, պատուհանի բացվելու/փակվելու անիմացիա, «Կիսվել»-ի կրկնակի սեղմումը չպետք է պատճենի։
  - Երկրորդ փաթեթ՝ ստորագիրը էջի ամենաներքևում, «Այլ նյութ չկա»-ն հանել, բաժինների ենթավերնագրերը հանել, պատճենի/կիսվելու տեքստ՝ վերնագիր → տեքստ → հղում, ամեն նյութի հղման նախադիտման նկար (`public/og`, `scripts/make-og-images.py`)։

- Telegram-ով մուտք բրաուզերում (oauth.telegram.org) և Google հաշիվը Telegram-ին կապելը — `feat/telegram-login` (`feat/verse-popup`-ի վրա)։ staging-ում աշխատում է (տերը մտավ Telegram-ով)։ Թողարկելիս՝ Ինտեգրացիաներին ասել, որ դնեն apostolic.am @armenian_apostolic_church_bot-ի վրա։
- Անգլերեն հասցեներ (`/psalms/22/6`, `/pray/71`, `/saints/…`, `/gospel/…`, `/daily/…`, `/questions/…`, `/post/…`), հին հասցեները 301; ամեն նյութի հղման նախադիտումը՝ նույն քարտը; «Կիսվել»/«Պատճենել»՝ միայն հղումը (`feat/telegram-login`)։
- Տիրոջ 4 դիտողություն (`feat/telegram-login`)՝ տեսանյութերի սև նկարներ, ամեն նյութի հղման քարտ տեքստի կտորով (`/og/card/...`), համարի պատուհանը չփակի մենյուն, «Ելք»-ը մենյուի ներքևում։

## Հերթ
1. Ամեն նյութի տակ աղբյուրի/հեղինակի տող։
2. «Հայտնել սխալի մասին» կոճակ նյութի էջում։
3. Սաղմոսների ցանկում «Շուտով» նշում դեռ չավելացվածների համար և համարակալման բացատրություն։
4. Ընթերցանության առաջընթաց ըստ բաժնի։
5. Բովանդակություն՝ 7 խորհուրդների PDF → հոգևորականների ստուգում → «Եկեղեցական կյանք» թեմա Telegram-ում → ծեսեր և արարողություններ։
6. Ավելի ուշ՝ աուդիոյի օպտիմալացում, տառատեսակներ, դիզայն և պատկերներ։
7. Առաջին այցի օգնության տեսանյութը (`help-video-sheet.tsx`, `preload="auto"`) ամեն նոր այցելուի մոտ բեռնում է 312 ԿԲ. բեռնել միայն բացելիս։ Դրանից հետո էջի կշիռը մնում է ~800–980 ԿԲ (JS 293, տառատեսակներ 105, բաժնի նկար 93–117)։

## Արված
- 2026-11-10 — Ցանկերի քարտերը (`/daily`, `/saints`, `/gospel`) և նյութի էջի նկարը՝ 800 px WebP, բնօրինակի փոխարեն. նկարների կշիռը `/daily`-ում 1335 → 530 ԿԲ, `/gospel`-ում 991 → 353 ԿԲ (հեռախոսի էկրան). դիտիչը բացում է բնօրինակը ([PR #161](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/161))։
- 2026-11-10 — Կայքի ամբողջական ստուգում և SEO ուղղումներ (տիրոջ խնդրանքով). սրբավայրերի էջերի վերնագիր/նկարագրություն/structured data, դատարկ սրբավայրերը noindex, բոլոր էջերի հղումները ցանկերում, վերնագրեր ≤ 65 նիշ, Cloudflare վիճակագրության CSP, մոմը միայն գլխավոր էջում — [#159](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/159)
- 2026-11-09 — Արագություն (Lighthouse). փոքր նկարներ հեռախոսներին, տառատեսակը 100→22 ԿԲ, cache-ից էջը առանց բազայի, ոչ անհրաժեշտ JS-ը՝ ուշ, գլխավոր նկարը առանց «հայտնվելու» էֆեկտի ([PR #157](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/157))։
- 2026-11-09 — Չատ. «մեռած» կապերը (էջը փակվել է առանց կապը փակելու) այլևս 🟢 չեն պահում (90 վ, alarm), նախկին ստացողի փակումը «վերջին անգամ» չի գրանցում։ Ամբողջ ճանապարհը ստուգված է «ստացող՝ Google, ադմին» հաշվով։
- 2026-11-09 — Չատ. «Ստուգում» տիրոջ ⚙-ում (ստացող, մուտք, ծանուցումների ուղիներ), առաջին մուտքի ծանուցման սխալը ուղղված։
- 2026-11-09 — Չատ. տիրոջը լուռ ծանուցում, երբ ստացողը բացում է կայքը (≤ 20 րոպեն մեկ, անջատվող)։
- 2026-11-08 — Չատ. պատասխան (reply) ցանկացած նամակին, մեջբերումով և բուն նամակին անցնելով։ Ստացողին փոխելիս նախկինը ամբողջությամբ անջատվում է ([PR #152](https://github.com/T0n0yan/armenian-apostolic-digital-library/pull/152))։
- 2026-11-08 — Չատի ֆոն (տիրոջ նկարը՝ թույլ, միայն կողմերին), ամեն մեկը՝ իր նկարը և թափանցիկությունը, մշուշոտ փուչիկներ/վերնագիր, «↓» կոճակ, CORP ֆայլերին։

## Կարևոր մյուսների համար
- Ցանկում կամ էջում Telegram-ի նկար ցույց տալիս՝ `mediaCardUrl()` (`/media/…?w=800`, 800 px WebP), ավետարանի շապիկը՝ `gospelVideoCover(post, true)`. `mediaUrl()`-ի բնօրինակը միայն դիտիչին և հղման նախադիտմանը։ Փոքր պատկերները՝ R2 `thumbs/`, `storedThumb` (`app/data/image-thumb.server.ts`). նոր լայնություն = ամեն նկարի նոր փոխարկում (անվճար՝ ամսական 5000)։
- SEO կանոնները՝ `docs/ARCHITECTURE.md` «Որոնիչների համար (SEO)». նոր էջի վերնագիրը՝ `pageTitle()`-ով, նոր ցանկում բոլոր էջերի հղումները պետք է լինեն HTML-ում (`<a href>`, ոչ միայն կոճակ)։ Սրբավայրը որոնման մեջ է մտնում միայն բովանդակությամբ (`placeHasContent`)։
- Նկարով կիսվել՝ `app/components/story-editor.tsx`, `app/utils/story-render.ts`, ֆոները `public/story-bg/` (`scripts/make-story-backgrounds.py`). նոր ձևավորում՝ `STORY_DESIGNS`-ում իր `box`-ով։ `ShareButton`-ին `story` տալով նյութը կիսվում է նկարով։ R2 `stories/`՝ Mini App-ի ժամանակավոր նկարներ, 2 օր։
- Աղոթքի ձևավորման պարբերությունը ունի `prayer` (բուն աղոթք, ընթերցողին չի երևում)՝ աղոթքը նկարով կիսվելու համար վերցնել `prayerParagraphs(layout)`-ով։
- Աղոթքի ձևավորումը՝ `material_layouts` (migration 0050), `app/utils/prayer-layout.ts`. ձևավորում ունեցող աղոթքը էջում ցույց է տրվում `PrayerLayoutView`-ով՝ Telegram-ի տեքստի փոխարեն (մեդիան վերևում, ձայնի հետ տող առ տող ընդգծում չկա)։ Նոր իրավունք՝ `layout`։
- Տեսանյութերը ավտոմատ սեղմվում են (`scripts/optimize-videos.ts`, `video_optimizations`, migration 0049). Telegram-ի ֆայլերը՝ նույն բանալիով, բնօրինակը `originals/`-ում 14 օր։ `library_media`-ն վերագրելիս `size_bytes`/`mime_type`/`r2_etag`-ը վերցնել `video_optimizations`-ից (տես `wrangler-cloud-target.ts`)։ Նոր տեսանյութի աղբյուր ավելացնելիս՝ ավելացնել `findCandidates`-ում։
- Օգնության տեսանյութեր՝ `/ognutyun`, ադմին՝ `/admin/help` (նոր իրավունք `help`), R2 `help/`, `site_settings.help_videos`։ Նոր ֆունկցիա ավելացնելիս՝ վիդեո `scripts/video-guides/`-ով և տող `app/utils/help-videos.ts`-ում։
- «Որտեղ էիք կանգնել»՝ `utils/last-place.ts` (`rememberPlace`, `lastPlace`). նոր բաժին (օր.՝ Աստվածաշունչ) ավելացնելիս բավական է, որ նյութի էջի `article`-ը ունենա `data-highlight-material`, `data-highlight-path`, `data-highlight-title`, `data-section-name`։
- Migration 0048՝ `highlights.verse`, `saved_verses`-ը տեղափոխված է նշումների մեջ և այլևս չի գրվում (`/api/saved-verses`-ը գրում է `highlights`)։ `/notes` → `/saved?tab=notes`։
- Migration 0047՝ `highlights` (ընթերցողի նշումները, `account-links`-ում տեղափոխվում են)։ Նյութի էջի `article`-ը ունի `data-highlight-material`. տեքստը `.reading-body`-ում պետք է լինի, որ նշելը աշխատի։ Նոր ներկեր՝ `::highlight(user-mark)`, `user-question`։ `/api/church-points`՝ եկեղեցիների կոորդինատները։
- `OWNER_ACCOUNTS` (wrangler.jsonc vars, ստորակետով՝ Google էլ. հասցեներ և @Telegram username-ներ). այդ հաշիվները միշտ գլխավոր ադմին են (`admin.server.ts`)։ Առայժմ միայն staging-ում։
- Migration 0043՝ `liturgy_marks`, `user_settings` (sunday_prompt), `yearly_summaries`։ Գիշերային մաքրումը (`retention.server.ts`) փետրվարի 1-ից ջնջում է նախորդ տարվա `reading_log`-ը և `liturgy_marks`-ը՝ պահելով ամփոփումը։ Նոր cron՝ `7 9 * * SUN` (wrangler.jsonc)։
- Տիրոջ որոշում (2026-10-31). նոր մեկնաբանությունները կոդում և commit-ները՝ հայերեն, կարճ (CLAUDE.md)։
- Բառարանը՝ `app/utils/glossary.ts` (որոնում՝ դասական ուղղագրություն, վերջավորություններ, «յ»/«զ» նախդիր), `components/glossary-layer.tsx` (root-ում)։ Կարդալու տեքստը պետք է լինի `.reading-body`-ի մեջ, որ բառարանը աշխատի։
- Migration 0040՝ `place_submissions.source` ('telegram' | 'web') և `user_id`։ Կայքից եկած նկարները `photos_json`-ում `r2:submissions/…` են. `/admin/telegram-file/` և `placeFromSubmission`-ը աշխատում են երկուսի հետ, «Մերժել»-ը ջնջում է դրանք։ `addServant`/`setAccessPart`-ը այժմ `app/utils/place-answers.ts`-ում են։
- Migration 0039՝ `admin_access` (owner, permissions)։ `requireAdmin`-ը այժմ տալիս է `{ owner, permissions }`. `/admin`-ի համար՝ `requireOwner`, մնացածի համար՝ `requirePermission(..., "places" | "places-delete" | "people" | "psalms" | "copy")`։ Իրավունքների ցանկը՝ `app/utils/admin-permissions.ts`։ Առաջին ադմինը (ամենահինը) դարձավ գլխավոր. Cloudflare Access-ով մտնողը միշտ գլխավոր է։
- `PageHeader`-ի որոնման կոճակը առանց `onSearch`-ի այժմ փնտրում է հենց էջում (`PageFind`), ոչ թե տանում `/search`։
- Migration 0038՝ `place_blocklist` և `place_rejected`. հրապարակված տեղերի ցանկը (`listPlaces({ publishedOnly: true })`, `getPlace(..., { publishedOnly: true })`) միշտ բաց է թողնում սև ցուցակի անունները։ `/api/places-search?q=`՝ որոնման էջի համար։
- Նոր հասցեներ՝ `/psalms`, `/pray`, `/saints`, `/gospel`, `/daily`, `/questions`, `/post` (`material-path.ts`). Հին հայերեն հասցեները (`/saghmosner/22`, `/aghotkner/71-…`) և `pray_71`, `/materials/…`, `/categories/…` տանում են նորերին 301-ով։ Բոտի deep link՝ `psalms_22` (հինները էլ են աշխատում)։
- Հղման քարտերը (սաղմոս, համար, աղոթք, հարց) նկարվում են GitHub Actions-ում (`scripts/og-cards.ts`, `.github/workflows/og-cards.yml`) և պահվում R2-ում `og/v1/<հասցե>.jpg`. Worker-ը միայն տալիս է (`/og/card/...`), քանի որ մեկ քարտը ~1 վրկ CPU է։ «Կիսվել»-ը և «Պատճենել»-ը տալիս են միայն հղումը (`shareLink()`), պատկերը՝ նախադիտման քարտում։ og:url-ը էջի սեփական հասցեով է (staging-ը՝ staging)։
- media.apostolic.am-ը CORS չի տալիս. նկարի պիքսելներ կարդալու կամ տեսանյութից կադր վերցնելու համար՝ կայքի `/media/...` (`sameOriginMedia()`)։
- Telegram մուտքը բրաուզերում՝ `/auth/telegram/start` → oauth.telegram.org → `/auth/telegram`. աշխատում է միայն երբ բոտի domain-ը դրված է BotFather-ում (production՝ apostolic.am, staging-ի բոտին՝ staging.apostolic.am)։ Google հաշիվը կապելիս նրա տվյալները տեղափոխվում են Telegram հաշվին (`account_links`, migration 0027)։
- Հղման նախադիտման նկարներ՝ `public/og/<բաժին>.jpg` (`sectionImage()` `app/utils/seo.ts`-ում). նյութի սեփական նկարը (սուրբ, օր, տեսանյութ) առաջնային է։
- Ստորագիրը `PageShell`-ում `mt-auto`-ով է (main-ը `flex flex-col`)։
- «Կիսվել» կոճակը այլևս Telegram-ի հղում չի տալիս՝ միշտ կայքի էջն է (տիրոջ որոշում՝ ստացողը կարող է Telegram չունենալ)։ `/api/share-prepare`-ը այլևս չի օգտագործվում։
- Նոր աղյուսակ՝ `saved_verses` (migration 0026)։
- Էջերի բաժինները՝ `frosted-panel` + ոսկեգույն `h2` (տես `app/routes/about.tsx`). նոր տեքստային էջերը նույն ձևով։
- Սրբավայրեր՝ migrations 0028–0037 (`places`, `place_submissions`, `bot_place_drafts`, `place_visits`). Production-ի քարտեզը սկսում է դատարկ, լրացվում է ընթերցողների `/place` հայտերով (ադմին՝ `/admin/places`)։
- Բոտի հայտերը գալիս են Support խմբի «Սրբավայրեր» թեմա՝ `SUPPORT_TOPIC_PLACES: "88"` (`wrangler.jsonc`), թեման չկա՝ General։ Թողարկումից հետո `/admin`-ում «Կրկին կապել»՝ որ բոտի մենյուում հայտնվի `/place`։
- Գիշերային մաքրում՝ `app/data/retention.server.ts` (սևագրեր 1 օր, չուղարկված հայտեր 1 օր, մշակվածները 30 օր)։ Staging-ում `TEST_DATA_DAYS: "3"`՝ փորձնական տվյալները 3 օրից։
- Staging-ի գործիքներ (աշխատում են միայն `staging` ճյուղում)՝ `.github/workflows/staging-reset.yml` + `scripts/staging-reset.sql` (2 նյութ ամեն բաժնից, դատարկ քարտեզ, էջերի ստուգում), `.github/workflows/staging-osm-places.yml` (OSM-ից եկեղեցիներ)։ Գործարկվում են իրենց ֆայլը փոխելով։
- Նկարներին `reveal-img` դաս (և շրջանակին `reveal-frame`)՝ ամբողջական բեռնվելուց հետո են երևում (`app/app.css`, լսիչը՝ `root.tsx`)։ Նոր նկարներին նույնը։
- Էջերի սքելեթոնները՝ `app/components/page-skeleton.tsx` (ամեն էջ և բաժին իր ձևով). նոր էջ ավելացնելիս՝ այստեղ էլ ավելացնել։
- GitHub Actions-ի անվճար րոպեները (ամսական 2000) 2026-10-27-ին սպառվեցին. ամենաշատը ծախսում էին հղումների քարտերը (`og-cards.yml`, ամեն թողարկումից հետո 2 job) և սինքրոնիզացիան (`cloud-sync.yml`, staging-ի դատարկ job-ը նույնպես 1 րոպե)։ Հիմա՝ քարտերը միայն production-ի սինքրոնիզացիայից հետո, դիզայնի փոփոխությամբ կամ ձեռքով, մեկ job. սինքրոնիզացիան մեկ job, GitHub-ի պահուստային գործարկումը շաբաթական. թողարկման build-ը մեկ անգամ. QA-ն չի աշխատում միայն docs փոփոխությունների համար։ Նոր workflow ավելացնելիս՝ մեկ job, `paths` ֆիլտր, առանց matrix-ի դատարկ մասերի։
