# Տեղական փորձարկում WebStorm-ով

Նոր փոփոխությունների ճյուղը՝ `feat/free-tier-efficiency`։ Այս քայլերը կատարվում են **ձեր համակարգչում**։ Cloud միջավայրի localhost-ը ձեր համակարգչի localhost-ը չէ։

## macOS — ամենապարզ տարբերակը

WebStorm-ի Terminal-ը բացել `View → Tool Windows → Terminal`-ից։ Նախ՝ `node --version`։ Պետք է Node.js 22 կամ նոր. եթե չկա, տեղադրել Node.js 24 LTS-ի macOS installer-ը [պաշտոնական կայքից](https://nodejs.org/en/download), հետո վերաբացել WebStorm-ը։

Ստորև `npx`-ը վերցնում է նախագծի կոնկրետ pnpm տարբերակը. գլոբալ pnpm տեղադրել պետք չէ։ Ներբեռնումը պահանջում է ինտերնետ, բայց Cloudflare/GitHub գաղտնիքներ պետք չեն։ Հրամանները միացված են `&&`-ով, որպեսզի սխալի դեպքում հաջորդ քայլը չսկսվի։

```sh
mkdir -p ~/Projects &&
cd ~/Projects &&
git clone --branch feat/free-tier-efficiency --single-branch https://github.com/T0n0yan/armenian-apostolic-digital-library.git armenian-library-local &&
cd armenian-library-local &&
npx --yes pnpm@10.28.0 install --frozen-lockfile &&
npx --yes pnpm@10.28.0 db:migrate:local &&
npx --yes pnpm@10.28.0 dev --host 127.0.0.1 --port 5173
```

Եթե `armenian-library-local` պանակն արդեն կա, հրամանը կանգ կառնի. այն մի ջնջեք և մի reset արեք։ Նախ ստուգել այնտեղ եղած աշխատանքը կամ ընտրել նոր պանակի անուն։ Եթե `git`-ը բացակայում է, macOS-ը կարող է առաջարկել տեղադրել Command Line Tools-ը. ամբողջ Xcode-ը պարտադիր չէ։

WebStorm-ում բացել `File → Open → ~/Projects/armenian-library-local` պանակը։ Բրաուզերում բացել `http://127.0.0.1:5173` (կամ Terminal-ի ցուցադրած այլ port-ը, եթե 5173-ը զբաղված է)։ Terminal-ը բաց պահել, կանգնեցնել՝ Ctrl+C։ Հաջորդ անգամ նույն պանակի Terminal-ում բավական է միայն վերջին `npx … dev` հրամանը։

Ցանկալի է նախ հաստատել, որ էջը բացվում է, հետո ավելացնել ներքևում նկարագրված փորձնական նյութերը։ Դատարկ բաժինները դեռ չեն նշանակում, որ տեղադրումը ձախողվել է։

Ստուգված է cloud/Linux միջավայրում՝ pnpm 10.28.0-ի `npx` գործարկումը, տեղական migrations-ը և development սերվերի գլխավոր էջի պատասխանը։ Օգտագործողի Mac-ում գործարկումը դեռ պետք է հաստատել. macOS-ում փորձարկված չենք հայտարարում։

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
