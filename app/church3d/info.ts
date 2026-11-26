// Եկեղեցու մասերի և պարագաների անուններն ու բացատրությունները։ Մեկ տեղ՝ բոլոր եկեղեցիների համար։
// Տեքստ փոխելու համար 3D կոդին ձեռք տալ պետք չէ։ Բոլորը ⚑ Ճշտել են՝ մինչև հոգևորականը ստուգի։

export type PartKind =
  | "khoran" | "bem" | "seghan" | "patker" | "varaguyr" | "avandatun" | "atyan" | "grakal" | "das" | "das-hark"
  | "nav" | "gmbet" | "jah" | "avazan" | "momakal" | "gavit" | "nstaran" | "gmbet-durs" | "zangakatun" | "mutq"
  | "skih" | "burvar" | "kshots" | "ashtanak" | "tapori-patker" | "avetaran";

export type PartInfo = {
  name: string;
  aka?: string;
  text: string;
  view: "inside" | "outside";
  /** «front»՝ նայում ենք առջևից, «outward»՝ վերևից-դրսից (կտրվածքով), «below»՝ ներքևից վեր։ */
  camera: "front" | "outward" | "below";
  distance?: number;
  /** Մանր պարագայի կետը երևում է միայն այսքան մետրից մոտ (որ ընդհանուր տեսքը չծանրաբեռնվի)։ */
  near?: number;
  check: boolean;
};

export const PART_INFO: Record<PartKind, PartInfo> = {
  khoran: {
    name: "Ավագ խորան", view: "inside", camera: "front", check: true,
    text: "Եկեղեցու արևելյան կիսաշրջանաձև մասը։ Եկեղեցին կառուցվում է արևելքին նայող, որովհետև արևելքից է սպասվում Քրիստոսի երկրորդ գալուստը։",
  },
  bem: {
    name: "Բեմ", view: "inside", camera: "front", check: true,
    text: "Խորանի բարձրացված հարթակը, որի վրա մատուցվում է Սուրբ Պատարագը։ Բեմ են բարձրանում սանդուղքներով։",
  },
  seghan: {
    name: "Սուրբ Սեղան", view: "inside", camera: "front", distance: 6, check: true,
    text: "Բեմի կենտրոնի սեղանը, որի վրա կատարվում է Սուրբ Պատարագի խորհուրդը։ Վրան դրված են Ավետարանը, խաչը և մոմերը։",
  },
  patker: {
    name: "Սրբապատկեր", view: "inside", camera: "front", distance: 6, check: true,
    text: "Սրբապատկերները հիշեցնում են Քրիստոսին, Սուրբ Աստվածածնին և սրբերին. նրանց առջև աղոթում և մոմ են վառում։",
  },
  varaguyr: {
    name: "Վարագույր", view: "inside", camera: "front", check: true,
    text: "Բեմի առջևի մեծ վարագույրը։ Փակվում է Պատարագի որոշ պահերին, օրինակ՝ ընծաները պատրաստելիս և քահանայի հաղորդվելու ժամանակ։ Մեծ պահքի օրերին փակ է մնում։",
  },
  avandatun: {
    name: "Ավանդատուն", view: "inside", camera: "outward", check: true,
    text: "Խորանի երկու կողմերի փոքր սենյակները։ Այստեղ պահվում են սրբազան անոթները, զգեստները և գրքերը, և այստեղ է քահանան զգեստավորվում Պատարագից առաջ։",
  },
  atyan: {
    name: "Ատյան", view: "inside", camera: "front", check: true,
    text: "Բեմի առջևի ցածր հարթակը՝ բեմի և ժողովրդի միջև։ Այստեղ են կատարվում որոշ արարողություններ և ընթերցումներ։",
  },
  grakal: {
    name: "Գրակալ", aka: "Ընթերցարան", view: "inside", camera: "front", distance: 3.2, check: true,
    text: "Ընթերցանության կանգնակը, որի վրա դրվում են Ավետարանը և Սուրբ Գրքի ընթերցվածքները։",
  },
  das: {
    name: "Դաս՝ երգչախմբի տեղը", aka: "Դաս", view: "inside", camera: "front", distance: 5, check: true,
    text: "Դպիրների և երգչախմբի տեղը։ Դասը երգում է շարականները և պատասխանում քահանային։ Տարբեր եկեղեցիներում այն տարբեր տեղում է՝ բեմի կողքին կամ երկրորդ հարկում։",
  },
  "das-hark": {
    name: "Երգչախմբի պատշգամբ", view: "inside", camera: "outward", check: true,
    text: "Շատ եկեղեցիներում երգչախումբը կանգնում է երկրորդ հարկում՝ արևմտյան պատշգամբում, որտեղից երգը լցնում է ամբողջ եկեղեցին։",
  },
  nav: {
    name: "Նավ", view: "inside", camera: "outward", check: true,
    text: "Եկեղեցու գլխավոր մասը, որտեղ աղոթում են հավատացյալները։ Անունը գալիս է նավի պատկերից. եկեղեցին փրկության տապանն է։",
  },
  gmbet: {
    name: "Գմբեթ", view: "inside", camera: "below", check: true,
    text: "Եկեղեցու կենտրոնի վերևի կամարը, որ խորհրդանշում է երկինքը։ Կանգնած է թմբուկի վրա, որի պատուհաններից լույսն իջնում է ներս։",
  },
  jah: {
    name: "Ջահ", aka: "Կանթեղ", view: "inside", camera: "front", distance: 7, check: true,
    text: "Կախովի ջահը։ Լույսը խորհրդանշում է Քրիստոսին՝ աշխարհի լույսին։",
  },
  avazan: {
    name: "Մկրտության ավազան", aka: "Ավազան", view: "inside", camera: "front", distance: 4, check: true,
    text: "Քարե ավազանը, որում կատարվում է Մկրտության խորհուրդը։ Հաճախ գտնվում է հյուսիսային պատի որմնախորշում։",
  },
  momakal: {
    name: "Մոմավառության սեղան", aka: "Մոմակալ", view: "inside", camera: "front", distance: 3.6, check: true,
    text: "Ավազով լի սեղանը, որտեղ հավատացյալները մոմ են վառում և աղոթում։",
  },
  gavit: {
    name: "Գավիթ", aka: "Ժամատուն", view: "inside", camera: "outward", check: true,
    text: "Եկեղեցու արևմտյան մուտքի առջևի սրահը։ Այստեղ հավաքվում էր ժողովուրդը, կատարվում էին որոշ արարողություններ։",
  },
  nstaran: {
    name: "Նստարան", view: "inside", camera: "front", distance: 4, check: true,
    text: "Նստարաններ կան ոչ բոլոր եկեղեցիներում. ավանդաբար Պատարագին մասնակցում են կանգնած։",
  },
  skih: {
    name: "Սկիհ", view: "inside", camera: "front", distance: 2.2, near: 9, check: true,
    text: "Սրբազան բաժակը, որում Սուրբ Պատարագի ժամանակ գինին օրհնվում է և դառնում Քրիստոսի Արյունը։ Դրանից են հաղորդվում։",
  },
  avetaran: {
    name: "Ավետարան", view: "inside", camera: "front", distance: 2.2, near: 9, check: true,
    text: "Ավետարանը դրվում է Սուրբ Սեղանի վրա։ Պատարագի ժամանակ այն բարձրացնում են, ընթերցում և համբուրում։",
  },
  burvar: {
    name: "Բուրվառ", view: "inside", camera: "front", distance: 2.6, near: 9, check: true,
    text: "Շղթաներով խնկաման, որով խնկարկում են։ Խնկի բուրումնավետ ծուխը խորհրդանշում է դեպի Աստված բարձրացող աղոթքը։",
  },
  kshots: {
    name: "Քշոց", aka: "Խշխշան", view: "inside", camera: "front", distance: 3.2, near: 10, check: true,
    text: "Ձողի վրա ամրացված մետաղե շրջանակ՝ սերովբեների պատկերով և զանգակներով։ Սարկավագները շարժում են այն Պատարագի ժամանակ, և նրա ղողանջը հիշեցնում է հրեշտակների ներկայությունը։",
  },
  ashtanak: {
    name: "Աշտանակ", aka: "Կանգնած մոմակալ", view: "inside", camera: "front", distance: 3, near: 10, check: true,
    text: "Բարձր մոմակալ՝ վառվող մոմով։ Կանգնում է բեմի մոտ, իսկ թափորների ժամանակ այն տանում են։",
  },
  "tapori-patker": {
    name: "Թափորի սրբապատկեր", view: "inside", camera: "front", distance: 3.4, near: 10, check: true,
    text: "Ձողի վրա ամրացված սրբապատկեր, որը տանում են թափորի ժամանակ։ Օրինակ՝ Սուրբ Աստվածածնի պատկերը Պատարագի սկզբի թափորում։",
  },
  "gmbet-durs": {
    name: "Գմբեթ և թմբուկ", view: "outside", camera: "front", check: true,
    text: "Դրսից հայկական եկեղեցու գմբեթը վեղարաձև (կոնաձև) է և նստած է բազմանիստ թմբուկի վրա։ Գագաթին խաչն է։",
  },
  zangakatun: {
    name: "Զանգակատուն", view: "outside", camera: "front", check: true,
    text: "Զանգերի աշտարակը. հաճախ կառուցվում է գավթի կամ տանիքի վրա, երբեմն՝ առանձին։ Զանգերը կանչում են ժամերգության և ավետում տոները։",
  },
  mutq: {
    name: "Արևմտյան մուտք", view: "outside", camera: "front", check: true,
    text: "Եկեղեցու գլխավոր մուտքը արևմուտքից է. մտնողը նայում է դեպի արևելք՝ դեպի խորանը։",
  },
};
