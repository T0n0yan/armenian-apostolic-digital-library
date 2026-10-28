# Տեղական փորձարկում WebStorm-ով

Նոր փոփոխությունների ճյուղը՝ `feat/free-tier-efficiency`։ Այս քայլերը կատարվում են **ձեր համակարգչում**։ Cloud միջավայրի localhost-ը ձեր համակարգչի localhost-ը չէ։

## Առաջին գործարկում

1. Տեղադրել Node.js 22 կամ ավելի նոր տարբերակ։ WebStorm → Settings → Languages & Frameworks → Node.js-ում ընտրել տեղադրված Node interpreter-ը։
2. WebStorm-ի Terminal-ում ստուգել `node --version` և `pnpm --version`։ Եթե pnpm չկա, տեղադրել `npm install --global pnpm@10.28.0`։ Նախագիծը սպասում է հենց pnpm 10.28.0։
3. Գործող տեղական փոփոխություններին չդիպչելու համար բացել նոր պանակում ներբեռնված պատճենը՝

```sh
git clone --branch feat/free-tier-efficiency --single-branch https://github.com/T0n0yan/armenian-apostolic-digital-library.git armenian-library-local
cd armenian-library-local
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev --host 127.0.0.1 --port 5173
```

Terminal-ում երևացող հասցեն բացել նույն համակարգչի բրաուզերում՝ `http://127.0.0.1:5173`։ Եթե այդ port-ը զբաղված է, կիրառել 5177 և բացել համապատասխան հասցեն։ Կանգնեցնել՝ Ctrl+C։

## WebStorm-ի Run կոճակ

Run → Edit Configurations → + → npm. ընտրել այս պատճենի `package.json`-ը, package manager՝ pnpm, Command՝ `run`, Scripts՝ `dev`, Arguments՝ `--host 127.0.0.1 --port 5173`։ Node interpreter-ը՝ Project։ Անվանել «Գրադարան — տեղական»։ Անվանումները կարող են փոքր-ինչ տարբերվել WebStorm-ի տարբերակից։

## Փորձնական նյութեր

Առաջին մեկնարկին local D1 բազան կարող է դատարկ լինել․ production բազան ինքնուրույն չի պատճենվում։ Առանց իրական գաղտնիքների հնարավոր է ստուգել տեսքը, երթուղիները և հանրային էջերը։

Միայն դատարկ փորձնական բազայի համար, սերվերը կանգնեցնելուց հետո՝

```sh
python3 scripts/qa-ui-fixture.py
```

Windows-ում Python Launcher-ի դեպքում նույնը՝ `py -3 scripts/qa-ui-fixture.py`։ Սա ավելացնում է չորս **սինթետիկ տեքստային նյութ**, ոչ իրական քարոզներ կամ audio ֆայլեր։ Սկրիպտը հրաժարվում է աշխատել, եթե արդեն գրադարանային նյութեր կան։ Բազան մի ջնջեք՝ այդ պաշտպանությունը շրջանցելու համար։ Հետո նորից գործարկել `pnpm dev`։

Իրական Google/Telegram մուտքը, ադմինի մուտքը, բոտի հաղորդագրությունները և իրական մեդիան պահանջում են առանձին փորձնական կարգավորում. այս քայլերով դրանց աշխատանքը հաստատված չի համարվում։ Production գաղտնիքները տեղական ֆայլերի մեջ մի պատճենեք։ `.dev.vars`-ը, եթե հետո պետք լինի, պետք է մնա Git-ից դուրս։

## Ստուգումներ

```sh
pnpm typecheck
pnpm lint
pnpm test
```

`pnpm test`-ը ստեղծում է build և օգտագործում առանձին տեղական emulation/fixture-ներ։ Development սերվերը կանգնեցրեք production preview/build փորձարկելիս, որպեսզի հին build-ից ակտիվ սերվեր չմնա։

Տիրոջ փորձարկման պարզ ցանկ՝ գլխավոր էջ → որոնում → նյութ → բաժին → հետ վերադարձ, հեռախոսի չափի պատուհան, մութ/լուսավոր տեսք, էջի թարմացում։ Աուդիոյի, owner հասանելիության և հաշիվների մեկուսացման ամբողջական ստուգումները կատարում է նաև գործակալը՝ համապատասխան միջավայրերում։
