# Ավտոմատ համաժամեցում GitHub Actions-ով (անվճար)

Ամեն ժամ (ժամը X:17-ին) GitHub-ը գործարկում է `.github/workflows/cloud-sync.yml`-ը.
այն ստուգում է Telegram խումբը և Cloudflare-ում թարմացնում նոր, խմբագրված ու ջնջված
նյութերը։ Mac-ը միացած լինել պետք չէ։ Private repo-ի համար GitHub-ը տալիս է ամսական
2000 անվճար րոպե. ժամային գործարկումն օգտագործում է մոտ 1440-ը։

## Մեկանգամյա կարգավորում

1. Cloudflare API token. dash.cloudflare.com → My Profile → API Tokens → Create Token →
   Custom token՝ `Account · D1 · Edit` և `Account · Workers R2 Storage · Edit`, միայն քո
   account-ի համար։ Պատճենիր token-ը։
2. Repo-ի պանակում գործարկիր.

   ```bash
   bash scripts/setup-github-sync.sh
   ```

   Սկրիպտը կխնդրի տեղադրել token-ը, հետո Telegram-ը կուղարկի մուտքի կոդ (ինչպես նոր
   սարքից մտնելիս)։ Ստեղծվում է GitHub-ի առանձին session, որը Telegram → Settings →
   Devices-ում կերևա որպես նոր սարք։

## Ստուգում

- GitHub → repo → Actions → «Cloud sync». կանաչ նշանը նշանակում է հաջողություն։
- Ձեռքով գործարկել. `gh workflow run cloud-sync.yml`
- Ադմինի էջի «Համաժամեցում» բաժինը ցույց է տալիս վերջին համաժամեցման ժամը։

Session-ը փոխելու կամ փակելու համար. Telegram → Settings → Devices, ապա նորից
`pnpm telegram:authorize --github-secret`։
