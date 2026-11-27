// GPT-ի (կամ այլ AI-ի) հրահանգը. ադմինը պատճենում է, տալիս է եկեղեցու նկարների հետ, ստանում JSON և
// տեղադրում խմբագրիչում («Ներմուծել»)։ Մեզ ոչինչ չարժե. AI-ն աշխատում է ադմինի սեփական հաշվով։
// v2. AI-ն կոորդինատներ չի հորինում, միայն ընտրում է բլոկները և դրանց չափերը. դիրքերը հաշվում է մեր կոդը (blocks.ts)։

import type { ChurchModelV2 } from "./blocks";

export function gptPrompt(example: ChurchModelV2, placeName: string) {
  return `Դու օգնում ես կառուցել Հայ Առաքելական եկեղեցու պարզեցված 3D մոդել պատրաստի բլոկներից։ Կցված են եկեղեցու նկարները (լավագույնը՝ 4 կողմից, ներսից, հնարավոր է՝ հատակագիծ)։
Եկեղեցին՝ «${placeName}»։

Աշխատանքի կարգը.
1. Նախ ամեն նկարում որոշիր՝ որ կողմից է նկարված (խորանը միշտ արևելքում է, գլխավոր մուտքը՝ սովորաբար արևմուտքում)։
2. Գտիր հատակագծի տիպը. մեկ դահլիճ (hall), խաչաձև կենտրոն (cross), կլոր/բազմանիստ (rotunda)։ Անկախ սյուներով խաչաձև եկեղեցում՝ cross + piers։
3. Ավելացրու կցված մասերը՝ խորաններ (apse), ավանդատներ և գավիթ (hall՝ parent-ով), գմբեթներ (dome), զանգակատներ (belfry)։
4. Չափերը գնահատիր մետրերով՝ համեմատելով դռան (~2,5–3 մ) և մարդու (~1,75 մ) հետ։ Ճշգրիտ չես կարող լինել. դա նորմալ է։

Պատասխանիր ՄԻԱՅՆ մեկ JSON օբյեկտով (առանց բացատրության, առանց \`\`\`), ներքևի օրինակի կառուցվածքով։
Կոորդինատներ մի՛ հորինիր. կցված բլոկը դրվում է parent-ի wall պատին (offset՝ շեղում պատի մեջտեղից, մ)։

Դաշտերը.
- version: 2, id: լատինատառ կարճ անուն, name, tuff: "pink" | "ochre" | "gray" | "black",
  look: { masonry: "plain" | "checker" (երկգույն շախմատ) | "bands", accent?: երկրորդ գույնը, plinth: ցոկոլի բարձրություն (մ), roof: "tile" (կղմինդր) | "stone", cornice?: true (քիվ) }։
- blocks՝ ցուցակ, ամեն մեկը { id, kind, name (հայերեն) … }.
  • hall՝ { width, length, height, ceiling: "vault" | "flat", roof: "gable" | "shed" | "tent" | "flat", rise?, aisles?: { width, height, columns } (եռանավ),
    part?: "nav" | "gavit" | "avandatun"; կցվածին՝ parent, wall, offset?, gap?, link?: "door" | "arch" | "none" }։ Արմատային դահլիճի երկարությունը արևելք-արևմուտք է։
  • cross՝ { half (կենտրոնական քառակուսու կեսը), arms: { west, east, north, south } (թևերի երկարությունը), height, outside: "cross" | "square", piers?: սյան հաստություն }։
  • rotunda՝ { sides, radius, height, roof: "tent" | "flat" }։
  • apse (խորան)՝ { parent, wall, width, depth, outside: "hidden" (դրսից ուղղանկյան մեջ) | "round" | "faceted", roof?: "cone" | "flat", windows?: [{ at?, y, w, h }] }։
  • dome՝ { parent, offset?: [x, z] (կենտրոնից), radius?, drum (թմբուկի բարձրություն), sides (նիստեր), cap: "cone" | "umbrella" | "none", capHeight? (կոնի բարձրությունը շառավղերով), arcade?: true (կույր կամարներ), cross?: false (առանց խաչի), windows?: { count, w, h } }։
  • belfry՝ { parent?, offset?: [x, z], radius, columns, height, tiers?, pavilion? (քառասյուն կամարավոր հիմքի բարձրություն), tower? (գետնից աշտարակ, մ), towerSize?, porch?: { w, h }, y? }։
- Պատերի անունները (wall). hall՝ "west" | "east" | "north" | "south"։ cross՝ նույնը (թևերի ծայրերը) և "west-south", "north-east"… (թևերի կողքերը)։ piers-ով cross՝ միայն 4 կողմերը։ rotunda՝ "s1"…"sN"։
- doors՝ [{ wall, at?, w, h, part?: "mutq" }], windows՝ [{ wall, at?, y (ներքևի եզրը հատակից), w, h, shape?: "arch" | "rect" | "round" | "slit" | "cross", count?, gap?, frame?: "pediment" | "hood" }], niches՝ [{ wall, at?, w, h, depth, arch? }]։
- bema, items՝ ինչպես օրինակում (կարող ես թողնել օրինակինը)։
- notes՝ ["…"]՝ ինչ չհաջողվեց տեսնել կամ կասկածելի է (հայերեն)։ Սա կօգնի ձեռքով ուղղել։

Օրինակ (խաչաձև գմբեթավոր եկեղեցի).
${JSON.stringify({ ...example, cameras: undefined })}
`;
}
