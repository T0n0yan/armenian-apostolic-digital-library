// GPT-ի (կամ այլ AI-ի) հրահանգը. ադմինը պատճենում է, տալիս է եկեղեցու նկարների հետ, ստանում JSON և
// տեղադրում խմբագրիչում («Ներմուծել»)։ Մեզ ոչինչ չարժե. AI-ն աշխատում է ադմինի սեփական հաշվով։

import type { ChurchModel } from "./model";

export function gptPrompt(example: ChurchModel, placeName: string) {
  return `Դու օգնում ես կառուցել Հայ Առաքելական եկեղեցու պարզեցված 3D մոդել։ Կցված են եկեղեցու նկարները (դրսից, ներսից, հնարավոր է՝ հատակագիծ)։
Եկեղեցին՝ «${placeName}»։

Պատասխանիր ՄԻԱՅՆ մեկ JSON օբյեկտով (առանց բացատրության, առանց \`\`\`), նույն կառուցվածքով, ինչ ներքևի օրինակը։
Չափերը մոտավոր գնահատիր մետրերով (դռան բարձրությունը ~2–3 մ, մարդը ~1,75 մ)։ Եթե ինչ-որ բան նկարներում չի երևում, թող ինչպես օրինակում է։

Կոորդինատներ (մետր). x՝ հյուսիս (−) / հարավ (+), z՝ արևելք (−) / արևմուտք (+), y՝ վեր։ Խորանը միշտ արևելքում է (z-ը փոքր), մուտքը՝ արևմուտքում։

Դաշտերը.
- version: 1, id: կարճ լատինատառ անուն, name: եկեղեցու անունը, tuff: "pink" | "ochre" | "gray" | "black" (քարի գույնը)։
- rooms: սենյակներ (նավ, ավանդատներ, գավիթ…)։ outline՝ կետերի ցուցակ [x, z] շրջանաձև հերթականությամբ. կոր պատի համար կետը [x, z, կորություն]
  (կորությունը մետր է, այդ կետից հաջորդին գնացող պատը դեպի դուրս ուռչում է, խորանի կիսաշրջանի համար = լարի կեսը)։
  height՝ պատերի բարձրությունը, heights՝ առանձին պատերի բարձրություն { "պատի համար": մ }, ceiling՝ "flat" (հարթ առաստաղ) կամ "open" (կամարներ/գմբեթ)։
  part՝ "nav" | "avandatun" | "gavit"։ apses՝ [{ edge, part: "khoran" }] կոր պատի վրա կիսագմբեթ։
  doors՝ [{ edge, at, w, h, part? }] (edge՝ պատի համարը՝ կետ i → i+1, at՝ կենտրոնը պատի սկզբից, մ), գլխավոր մուտքին part: "mutq"։
  windows՝ [{ edge, at, y, w, h, shape: "arch" | "rect" | "round" | "slit" | "cross", count?, gap? }] (y՝ ներքևի եզրը հատակից)։
- vaults՝ գլանաձև կամարներ [{ from: [x,z], to: [x,z], width, spring (սկզբի բարձրություն), closeFrom?, closeTo? }] (true՝ ծայրը փակ է պատով)։
- arcades՝ սյունաշարեր նավերի միջև [{ from, to, count (սյուների թիվը), spring, top, pillar (սյան հաստություն) }]։
- dome (եթե կա գմբեթ)՝ { at: [x,z], radius, base (թմբուկի հիմքի բարձրություն), drum (թմբուկի բարձրություն), sides (նիստերի թիվը դրսից), bay (գմբեթատակ քառակուսու կես-լայնություն), windows: { count, w, h } }։
- masses՝ դրսի ծավալներ [{ outline, base?, height, roof: { type: "flat" } | { type: "gable", axis: "x" | "z", rise } | { type: "tent", rise } }]։
- bema՝ բեմ { outline (առաջին պատը՝ կետ 0 → 1, առջևի եզրն է, նայում է դեպի ժողովուրդ), height, stairs: "sides" | "center", atyan?: { width, depth, height }, curtainTop }։
- balconies՝ երկրորդ հարկ (օր.՝ երգչախմբի) [{ outline, floor (բարձրություն), part: "das-hark", stairs?: { at, dir: [dx,dz], width } }]։
- belfry՝ զանգակատուն { at, base, radius, columns, height }։
- items՝ պարագաներ [{ type, at: [x,z], y? (հատակից), rot? (աստիճան, 0՝ դեմքով դեպի արևմուտք), w?, h?, top?, name?, niche? }].
  type՝ "altar" | "lectern" | "font" | "candle-table" | "chandelier" | "choir" | "icon" | "bench" | "column" | "chalice" | "gospel" | "censer" | "fan" | "candlestick" | "procession-icon"։
- cameras՝ կարող ես չգրել։

Օրինակ (խաչաձև գմբեթավոր եկեղեցի).
${JSON.stringify({ ...example, cameras: undefined, tour: undefined })}
`;
}
