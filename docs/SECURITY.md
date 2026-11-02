# Անվտանգություն — ձեռքով կարգավորումներ (Cloudflare / GitHub)

Կոդով շտկվող ամեն ինչ արված է (տես git պատմությունը՝ `fix/security-*`, `feat/logout-all-devices`)։
Այս ֆայլը պահում է այն քայլերը, որ **միայն սեփականատերը** կարող է անել վահանակներում։ Ամեն մեկի դիմաց՝
ինչ, ինչու, և ճշգրիտ արժեքը մեր կոդին համապատասխան։ Արվածները նշել ✅-ով։

## 1. R2 — media.apostolic.am-ում փակել private ուղիները (A-01)

**Վիճակ.** r2.dev public URL-ն անջատ է ✅։ Custom domain `media.apostolic.am`-ը ամբողջ բաքեթն է
հրապարակում։ Կոդը media.apostolic.am-ով ցույց է տալիս **միայն** գրադարանի մեդիան (`v1/`,
`app/data/media-url.server.ts`)։ Սրբավայրերն ու առաջարկները անցնում են Worker-ով (`/place-media/`,
որը չհրապարակված տեղի համար պահանջում է `places` իրավունք)։ Ուստի `places/` և `submissions/`
ուղիները media.apostolic.am-ում պետք չեն և պետք է արգելվեն՝ ուղիղ-հասցեով շրջանցումը փակելու համար։

**Քայլ.** dash.cloudflare.com → `apostolic.am` դոմեյնը → **Security → WAF → Custom rules → Create rule**.
- Անուն՝ `block-private-media-paths`
- Expression (Edit expression, paste).
  ```
  (http.host eq "media.apostolic.am" and (starts_with(http.request.uri.path, "/places/") or starts_with(http.request.uri.path, "/submissions/")))
  ```
- Action՝ **Block**
- Deploy։

Ոչինչ չի կոտրվում. կայքը այդ ֆայլերը media.apostolic.am-ով երբեք չի բացում։

## 2. Cloudflare Access — owner allowlist (A-02)

Եթե `/admin`-ի համար Cloudflare Access-ը միացված է, ստուգել, որ policy-ն թույլ է տալիս **միայն**
սեփականատիրոջ կոնկրետ հաշիվները (ոչ ամբողջ դոմեյն/խումբ)։
dash.cloudflare.com → **Zero Trust → Access → Applications** → policy-ի **Include** կանոնը նեղացնել։

## 3. GitHub — code security (A-14, A-15)

github.com → ռեպո → **Settings**.
- **Code security** → միացնել՝ Dependabot alerts, Secret scanning, Push protection։
- **Branches / Rulesets** → `main`-ի համար «Require a pull request before merging»։

## 4. Backup — ամենակարևորը (A-18)

**Վիճակ.** Պահուստային պատճեններ **չկան** (`.github/workflows/private-backup.yml`-ը skipped է,
որովհետև `BACKUP_AGE_RECIPIENT` և `BACKUP_R2_BUCKET` չկան)։ Բազան վնասվելու դեպքում վերականգնում չկա։

**Քայլ.**
1. Cloudflare → R2 → **Create bucket** (օր.՝ `apostolic-backups`, public access **անջատ**)։
2. Գաղտնագրման `age` բանալի ստեղծել (բանալին պահում է **միայն** սեփականատերը, ոչ ռեպոյում)։
3. GitHub → ռեպո → **Settings → Secrets and variables → Actions → Variables**.
   - `BACKUP_R2_BUCKET` = `apostolic-backups`
   - `BACKUP_AGE_RECIPIENT` = `age1...` (հրապարակային մասը)
4. Գործարկել `Private database backup` workflow-ը ձեռքով, ստուգել, որ ֆայլ է հայտնվում բաքեթում։
5. Ամիսը մեկ՝ վերականգնման փորձ առանձին staging/ժամանակավոր բազայում (restore drill)։

**Վերականգնում.** `age -d -i backup-key.txt backup.sql.age > database.sql`, հետո ներմուծել նոր D1 բազա։
Որոնման ինդեքսը (`library_search_fts*`) backup-ում չկա (ածանցյալ է). այն նորից կկառուցվի՝ ձեռքով «Cloud sync»
գործարկելով կամ կայքի առաջին sync-ին (`library_search_documents`-ից)։

## Արված (կոդով, prod-ում)

A-03 ադմինի ինքնություն · A-04 Web Push SSRF · A-05 OG արտահոսք · A-06 CSP · A-07/A-12 rate limiting ·
A-08 «ելք բոլոր սարքերից» · A-09 Telegram login 15ր · A-10 maps redirect · A-11 նկարի magic bytes ·
A-13 R2 որբ ֆայլեր (0, հաշվետվությունում) · A-16 account-link ատոմային · A-17 upload չափ+magic ·
Google JWKS ստորագրություն։
