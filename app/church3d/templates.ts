// Պատրաստի ձևանմուշներ՝ եկեղեցու հիմնական տիպերը, հավաքված բլոկներից (v2, `blocks.ts`)։ Ադմինը կարող է
// պատճենել և փոխել։ Չափերը մոտավոր են՝ տիպը ցույց տալու համար, ոչ թե կոնկրետ եկեղեցի։

import { compileModel, type ChurchModelV2 } from "./blocks";
import type { ChurchModel } from "./model";

const CROSS_DOMED: ChurchModelV2 = {
  version: 2,
  id: "cross-domed",
  name: "Խաչաձև գմբեթավոր",
  tuff: "pink",
  look: { masonry: "plain", plinth: 0.6, roof: "stone" },
  blocks: [
    {
      id: "main", kind: "cross", name: "Խաչաձև դահլիճ", part: "nav", partAt: [0, 1.6, 7], half: 4, arms: { west: 7, north: 3, south: 3, east: 0 }, height: 9, outside: "square", rise: 4.2,
      windows: [
        { wall: "west", y: 9.8, w: 0.6, h: 1.6 }, { wall: "west", y: 4.6, w: 0.5, h: 1.6 },
        { wall: "south", y: 9.8, w: 0.6, h: 1.6 }, { wall: "south", y: 5.4, w: 0.5, h: 1.6 },
        { wall: "north", y: 9.8, w: 0.6, h: 1.6 }, { wall: "north", y: 5.4, w: 0.5, h: 1.6 },
        { wall: "west-south", y: 5.6, w: 0.5, h: 1.6 }, { wall: "west-north", y: 5.6, w: 0.5, h: 1.6 },
      ],
      niches: [{ wall: "north", at: 2.6, w: 1.6, h: 2.6, depth: 0.9, arch: true }],
    },
    {
      id: "khoran", kind: "apse", name: "Խորան", parent: "main", wall: "east", width: 8, depth: 4, outside: "hidden",
      windows: [{ at: -3.66, y: 5.8, w: 0.45, h: 1.5 }, { at: 3.66, y: 5.8, w: 0.45, h: 1.5 }],
    },
    { id: "avandatun-n", kind: "hall", name: "Հյուսիսային ավանդատուն", part: "avandatun", parent: "main", wall: "north-east", offset: 0.2, width: 2.6, length: 4, height: 6, ceiling: "flat", roof: "flat", linkW: 1.2, linkH: 2.4 },
    { id: "avandatun-s", kind: "hall", name: "Հարավային ավանդատուն", part: "avandatun", parent: "main", wall: "south-east", offset: -0.2, width: 2.6, length: 4, height: 6, ceiling: "flat", roof: "flat", linkW: 1.2, linkH: 2.4 },
    {
      id: "gavit", kind: "hall", name: "Գավիթ", part: "gavit", partAt: [0, 2.2, 14.2], parent: "main", wall: "west", width: 10, length: 5.6, height: 6, ceiling: "flat", roof: "gable", rise: 1.6, linkW: 2, linkH: 3.2,
      doors: [{ wall: "west", w: 2, h: 3, part: "mutq" }],
      windows: [{ wall: "south", y: 2.4, w: 0.5, h: 1.4 }, { wall: "north", y: 2.4, w: 0.5, h: 1.4 }],
    },
    { id: "gmbet", kind: "dome", name: "Գմբեթ", parent: "main", radius: 3.6, drum: 3, sides: 12, cap: "cone", windows: { count: 12, w: 0.42, h: 1.5 } },
    { id: "zangakatun", kind: "belfry", name: "Զանգակատուն", parent: "gavit", radius: 1.2, columns: 6, height: 2.3 },
  ],
  bema: {
    outline: [[-4, -3], [4, -3], [4, -4, 4], [-4, -4]],
    height: 1.3, stairs: "sides", atyan: { width: 5.2, depth: 1.9, height: 0.35 }, curtainTop: 8.65,
  },
  items: [
    { type: "altar", at: [0, -6.1], y: 1.3 },
    { type: "gospel", at: [0.35, -6], y: 2.35, rot: 10 },
    { type: "chalice", at: [-0.45, -5.95], y: 2.35 },
    { type: "fan", at: [-1.6, -6.2], y: 1.3 },
    { type: "fan", at: [1.6, -6.2], y: 1.3 },
    { type: "candlestick", at: [-3.4, -3.5], y: 1.3 },
    { type: "candlestick", at: [3.4, -3.5], y: 1.3 },
    { type: "censer", at: [2.3, -4.7], y: 1.3, rot: -90 },
    { type: "procession-icon", at: [-2.4, -4.7], y: 1.3, name: "Սուրբ Աստվածածնի պատկերը՝ թափորի համար" },
    { type: "icon", at: [0, -7.82], y: 4.6, w: 2, h: 3, name: "Սուրբ Աստվածածնի սրբապատկեր" },
    { type: "lectern", at: [0, -1.6], y: 0.35 },
    { type: "choir", at: [-5.6, -0.6], rot: 90 },
    { type: "font", at: [-7.45, 2.6], rot: 90 },
    { type: "candle-table", at: [2.9, 9.2] },
    { type: "chandelier", at: [0, 0], y: 9.6, top: 13 },
  ],
  cameras: {
    khoran: { eye: [0, 4, 7], look: [0, 5.5, -6] },
    bem: { eye: [-3.4, 3.4, 3.6], look: [0, 1.3, -4.6] },
    seghan: { eye: [2.4, 3.6, 0.2], look: [0, 2.2, -6.3] },
    patker: { eye: [0, 3.6, -0.6], look: [0, 6, -7.9] },
    varaguyr: { eye: [1.2, 3.2, 6.2], look: [0, 4.8, -3] },
    avandatun: { eye: [-15, 10, -2.5], look: [-5.7, 1.2, -6.4] },
    atyan: { eye: [2.6, 2.6, 4.2], look: [0, 0.6, -2] },
    grakal: { eye: [1.6, 2.1, 2.4], look: [0, 1.2, -1.6] },
    das: { eye: [-1, 2.8, 4.6], look: [-5.4, 1, -0.6] },
    nav: { eye: [0, 2.4, 10.4], look: [0, 3, 1] },
    jah: { eye: [3, 5, 7.4], look: [0, 9.4, 0] },
    avazan: { eye: [-3.4, 2.4, 1.2], look: [-7.3, 1.1, 2.6] },
    momakal: { eye: [0.6, 2.3, 6.2], look: [2.9, 0.9, 9.2] },
    gavit: { eye: [3.8, 2.6, 16.4], look: [0, 2, 13] },
    "gmbet-durs": { eye: [20, 17, 24], look: [0, 15, 0] },
    zangakatun: { eye: [10, 10, 28], look: [0, 8, 14.4] },
    mutq: { eye: [6, 4, 30], look: [0, 3, 17.4] },
  },
};

const SINGLE_NAVE: ChurchModelV2 = {
  version: 2,
  id: "single-nave",
  name: "Միանավ բազիլիկ",
  tuff: "ochre",
  look: { masonry: "checker", accent: "black", plinth: 0.5, roof: "tile" },
  blocks: [
    {
      id: "main", kind: "hall", name: "Նավ", part: "nav", partAt: [0, 1.6, 5], at: [0, 2.5], width: 10, length: 15, height: 6, ceiling: "vault", roof: "gable", rise: 4.8,
      doors: [{ wall: "west", w: 1.8, h: 3, part: "mutq" }],
      windows: [
        { wall: "south", y: 3.2, w: 0.5, h: 1.6, count: 3, gap: 4.5 },
        { wall: "north", y: 3.2, w: 0.5, h: 1.6, count: 3, gap: 4.5 },
        { wall: "west", y: 7.6, w: 1, h: 1, shape: "cross" },
      ],
      niches: [{ wall: "north", at: 4, w: 1.6, h: 2.6, depth: 0.9, arch: true }],
    },
    { id: "khoran", kind: "apse", name: "Խորան", parent: "main", wall: "east", width: 6, depth: 3, outside: "hidden", windows: [{ y: 3.4, w: 0.4, h: 1.4 }] },
    { id: "avandatun-n", kind: "hall", name: "Հյուսիսային ավանդատուն", part: "avandatun", parent: "main", wall: "east", offset: 4.2, width: 1.6, length: 3, height: 4.5, ceiling: "flat", roof: "flat", linkW: 1, linkH: 2.2 },
    { id: "avandatun-s", kind: "hall", name: "Հարավային ավանդատուն", part: "avandatun", parent: "main", wall: "east", offset: -4.2, width: 1.6, length: 3, height: 4.5, ceiling: "flat", roof: "flat", linkW: 1, linkH: 2.2 },
    { id: "zangakatun", kind: "belfry", name: "Զանգակատուն", parent: "main", offset: [0, 6.7], radius: 0.85, columns: 4, height: 1.6 },
  ],
  bema: { outline: [[-3, -2.6], [3, -2.6], [3, -5, 3], [-3, -5]], height: 1.1, stairs: "center", curtainTop: 5.8 },
  items: [
    { type: "altar", at: [0, -5.8], y: 1.1 },
    { type: "gospel", at: [0.35, -5.7], y: 2.15, rot: 10 },
    { type: "chalice", at: [-0.45, -5.65], y: 2.15 },
    { type: "fan", at: [-1.5, -5.9], y: 1.1 },
    { type: "fan", at: [1.5, -5.9], y: 1.1 },
    { type: "candlestick", at: [-2.6, -2.95], y: 1.1 },
    { type: "candlestick", at: [2.6, -2.95], y: 1.1 },
    { type: "censer", at: [2.1, -3.8], y: 1.1, rot: -90 },
    { type: "procession-icon", at: [-2.1, -3.8], y: 1.1 },
    { type: "lectern", at: [1.8, -1.6], rot: -20 },
    { type: "choir", at: [-3.6, -0.9], rot: 90 },
    { type: "font", at: [-5.45, 6.5], rot: 90 },
    { type: "candle-table", at: [3.2, 8.3] },
    { type: "icon", at: [4.97, 2], y: 1.6, w: 1.1, h: 1.6, rot: -90 },
    { type: "chandelier", at: [0, 3], y: 6.4, top: 10 },
  ],
  cameras: { nav: { eye: [0, 2.4, 9.4], look: [0, 2.6, -2] } },
};

const THREE_NAVE: ChurchModelV2 = {
  version: 2,
  id: "three-nave",
  name: "Եռանավ բազիլիկ",
  tuff: "gray",
  look: { masonry: "plain", plinth: 0.6, roof: "stone" },
  blocks: [
    {
      id: "main", kind: "hall", name: "Եռանավ դահլիճ", part: "nav", partAt: [0, 1.6, 4], at: [0, 3], width: 14, length: 18, height: 8, ceiling: "vault", roof: "gable", rise: 3,
      aisles: { width: 4, height: 5.5, columns: 6 },
      doors: [{ wall: "west", w: 2, h: 2.9, part: "mutq" }],
      windows: [
        { wall: "south", y: 2.6, w: 0.5, h: 1.5, count: 4, gap: 4 },
        { wall: "north", y: 2.6, w: 0.5, h: 1.5, count: 4, gap: 4 },
        { wall: "west", y: 8.6, w: 0.9, h: 0.9, shape: "round" },
      ],
      niches: [{ wall: "north", at: 2, w: 1.6, h: 2.6, depth: 0.9, arch: true }],
    },
    { id: "khoran", kind: "apse", name: "Խորան", parent: "main", wall: "east", width: 6, depth: 3, outside: "hidden", windows: [{ y: 4, w: 0.45, h: 1.6 }] },
    { id: "avandatun-n", kind: "hall", name: "Հյուսիսային ավանդատուն", part: "avandatun", parent: "main", wall: "east", offset: 5.2, width: 3.6, length: 2.6, height: 5, ceiling: "flat", roof: "flat", linkW: 1.1, linkH: 2.4 },
    { id: "avandatun-s", kind: "hall", name: "Հարավային ավանդատուն", part: "avandatun", parent: "main", wall: "east", offset: -5.2, width: 3.6, length: 2.6, height: 5, ceiling: "flat", roof: "flat", linkW: 1.1, linkH: 2.4 },
  ],
  bema: { outline: [[-3, -3.4], [3, -3.4], [3, -6, 3], [-3, -6]], height: 1.2, stairs: "center", curtainTop: 7.6 },
  balconies: [{ outline: [[-7, 9.5], [7, 9.5], [7, 12], [-7, 12]], floor: 3.4, part: "das-hark", stairs: { at: [-5.4, 4], dir: [0, 1], width: 1 } }],
  items: [
    { type: "altar", at: [0, -6.6], y: 1.2 },
    { type: "gospel", at: [0.35, -6.5], y: 2.25, rot: 10 },
    { type: "chalice", at: [-0.45, -6.45], y: 2.25 },
    { type: "fan", at: [-1.5, -6.7], y: 1.2 },
    { type: "fan", at: [1.5, -6.7], y: 1.2 },
    { type: "candlestick", at: [-2.6, -3.75], y: 1.2 },
    { type: "candlestick", at: [2.6, -3.75], y: 1.2 },
    { type: "censer", at: [2.1, -4.6], y: 1.2, rot: -90 },
    { type: "procession-icon", at: [-2.1, -4.6], y: 1.2 },
    { type: "lectern", at: [0, -2.6] },
    { type: "choir", at: [0, 10.7], y: 3.4, rot: 180 },
    { type: "font", at: [-7.45, 5], rot: 90 },
    { type: "candle-table", at: [5.2, 6] },
    { type: "icon", at: [6.97, 0], y: 1.6, w: 1.1, h: 1.6, rot: -90 },
    { type: "icon", at: [-6.97, -2], y: 1.6, w: 1.1, h: 1.6, rot: 90 },
    { type: "chandelier", at: [0, 2], y: 6.6, top: 11 },
  ],
  cameras: { "das-hark": { eye: [2, 2.4, 0], look: [0, 3.8, 11] }, nav: { eye: [0, 5.3, 11], look: [0, 2.6, -3] } },
};

// Մայր Աթոռ Սուրբ Էջմիածին՝ առաջին իրական օրինակ։ ⚑ Ճշտել. բոլոր չափերը մոտավոր են (լուսանկարների համամասնություններից),
// կառուցվածքը՝ աղբյուրներից. խաչաձև հատակագիծ չորս անկախ սյուներով, կենտրոնական գմբեթ ութանիստ թմբուկով, դուրս ցցված
// խորաններ (ներսից կիսաշրջան, դրսից նիստավոր), հյուսիսային, արևելյան և հարավային խորանների վրա վեցսյուն ռոտոնդաներ
// քառասյուն կամարավոր հիմքերի վրա, արևմտյան մուտքի առջև եռահարկ զանգակատուն, արևելքում՝ կցակառույց (թանգարան)։
const H = 11;
const ETCHMIADZIN: ChurchModelV2 = {
  version: 2,
  id: "etchmiadzin",
  name: "Մայր Աթոռ Սուրբ Էջմիածին (⚑ փորձ)",
  tuff: "pink",
  look: { masonry: "plain", plinth: 1.1, roof: "stone", cornice: true },
  blocks: [
    {
      id: "main", kind: "cross", name: "Տաճար (չորս սյուներով)", part: "nav", partAt: [0, 1.8, 5], half: 4.2, arms: { west: 4, east: 4, north: 4, south: 4 }, height: H, outside: "square", rise: 3, piers: 1.6,
      doors: [{ wall: "west", w: 2.4, h: 4, part: "mutq" }, { wall: "north", at: 5.6, w: 1.6, h: 3 }, { wall: "south", at: -5.6, w: 1.6, h: 3 }],
      windows: [
        { wall: "west", at: -5.4, y: 6, w: 0.8, h: 2.2, count: 2, gap: 1.4, frame: "pediment" }, { wall: "west", at: 5.4, y: 6, w: 0.8, h: 2.2, count: 2, gap: 1.4, frame: "pediment" },
        { wall: "south", at: 5.6, y: 6, w: 0.8, h: 2.2, count: 2, gap: 1.4, frame: "pediment" }, { wall: "south", at: -5.6, y: 6.6, w: 0.7, h: 2 },
        { wall: "north", at: -5.6, y: 6, w: 0.8, h: 2.2, count: 2, gap: 1.4, frame: "pediment" }, { wall: "north", at: 5.6, y: 6.6, w: 0.7, h: 2 },
        { wall: "east", at: 6, y: 6.6, w: 0.7, h: 2 }, { wall: "east", at: -6, y: 6.6, w: 0.7, h: 2 },
      ],
    },
    { id: "khoran", kind: "apse", name: "Արևելյան խորան", parent: "main", wall: "east", width: 8.4, depth: 4, outside: "faceted", roof: "flat", windows: [{ y: 5, w: 0.6, h: 2 }, { at: -4.5, y: 5, w: 0.6, h: 2 }, { at: 4.5, y: 5, w: 0.6, h: 2 }] },
    { id: "khoran-n", kind: "apse", name: "Հյուսիսային խորան", part: "khoran-kogh", parent: "main", wall: "north", width: 8.4, depth: 4, outside: "faceted", roof: "flat", windows: [{ y: 5, w: 0.6, h: 2 }] },
    { id: "khoran-s", kind: "apse", name: "Հարավային խորան", part: "khoran-kogh", parent: "main", wall: "south", width: 8.4, depth: 4, outside: "faceted", roof: "flat", windows: [{ y: 5, w: 0.6, h: 2 }] },
    { id: "gmbet", kind: "dome", name: "Գլխավոր գմբեթ", parent: "main", radius: 3.8, drum: 5, sides: 8, cap: "cone", capHeight: 1.75, arcade: true, windows: { count: 8, w: 0.7, h: 2 } },
    { id: "rotonda-e", kind: "belfry", name: "Արևելյան ռոտոնդա", parent: "main", offset: [0, -10.2], y: H + 0.2, pavilion: 3, radius: 1.1, columns: 6, height: 2.2 },
    { id: "rotonda-n", kind: "belfry", name: "Հյուսիսային ռոտոնդա", parent: "main", offset: [-10.2, 0], y: H + 0.2, pavilion: 3, radius: 1.1, columns: 6, height: 2.2 },
    { id: "rotonda-s", kind: "belfry", name: "Հարավային ռոտոնդա", parent: "main", offset: [10.2, 0], y: H + 0.2, pavilion: 3, radius: 1.1, columns: 6, height: 2.2 },
    { id: "zangakatun", kind: "belfry", name: "Եռահարկ զանգակատուն", parent: "main", offset: [0, 12.2], tower: H, towerSize: 7.2, porch: { w: 3.4, h: 5.4 }, pavilion: 3.6, radius: 1.4, columns: 8, height: 2.6 },
    {
      id: "tangaran", kind: "hall", name: "Արևելյան կցակառույց (թանգարան)", parent: "main", wall: "east", gap: 4.6, width: 15, length: 8, height: 8, ceiling: "flat", roof: "flat", link: "none", hide: ["inside"],
      windows: [{ wall: "south", y: 3, w: 0.9, h: 2.4, frame: "hood" }, { wall: "north", y: 3, w: 0.9, h: 2.4, frame: "hood" }, { wall: "east", y: 4, w: 1.2, h: 1.2, shape: "round" }, { wall: "east", at: -4.5, y: 3, w: 0.9, h: 2.4, frame: "pediment" }, { wall: "east", at: 4.5, y: 3, w: 0.9, h: 2.4, frame: "pediment" }],
    },
  ],
  bema: { outline: [[-4.2, -6.6], [4.2, -6.6], [4.2, -8.2, 4], [-4.2, -8.2]], height: 1.5, stairs: "sides", atyan: { width: 5.6, depth: 2, height: 0.35 }, curtainTop: H - 0.4 },
  items: [
    // Ավագ խորան՝ Սուրբ Սեղան, Աստվածամոր պատկերը Մանուկով, բեմի առջևում՝ տասներկու առաքյալները։
    { type: "altar", at: [0, -10.3], y: 1.5 },
    { type: "gospel", at: [0.35, -10.2], y: 2.55, rot: 10 },
    { type: "chalice", at: [-0.45, -10.15], y: 2.55 },
    { type: "fan", at: [-1.6, -10.4], y: 1.5 },
    { type: "fan", at: [1.6, -10.4], y: 1.5 },
    { type: "candlestick", at: [-3.6, -7], y: 1.5 },
    { type: "candlestick", at: [3.6, -7], y: 1.5 },
    { type: "icon", at: [0, -12.02], y: 4.6, w: 2.8, h: 4, subject: "theotokos", name: "Սուրբ Աստվածածին Մանուկ Հիսուսով (ավագ խորանի պատկերը)" },
    { type: "icon", at: [0, -6.58], y: 0.15, w: 6, h: 1.2, subject: "apostles", name: "Տասներկու առաքյալներ" },
    // Գմբեթի տակ՝ Իջման սեղան, հյուսիսում՝ Կաթողիկոսական գահ (⚑ ճշգրիտ տեղը), հարավում՝ երգեհոն և դաս։
    { type: "descent-altar", at: [0, 0] },
    { type: "throne", at: [-6.4, -5.2], rot: 90 },
    { type: "organ", at: [7.6, -5.8], rot: -90, w: 3, h: 6 },
    { type: "choir", at: [6.4, -2.2], rot: -90 },
    { type: "choir", at: [6.4, 1.4], rot: -90 },
    { type: "lectern", at: [0, -4.6], y: 0.35 },
    // Կողային խորաններ՝ սեղանով և պատկերով (⚑ ում են նվիրված)։
    { type: "altar", at: [-10.6, 0], rot: 90 },
    { type: "icon", at: [-12.15, 0], y: 2.6, w: 1.8, h: 2.6, rot: 90, subject: "christ" },
    { type: "altar", at: [10.6, 0], rot: -90 },
    { type: "icon", at: [12.15, 0], y: 2.6, w: 1.8, h: 2.6, rot: -90, subject: "theotokos" },
    // Սրբապատկերներ սյուներին և պատերին (⚑ ով է պատկերված)։
    { type: "icon", at: [-4.2, -3.38], y: 1.8, w: 1, h: 1.5, subject: "christ" },
    { type: "icon", at: [4.2, -3.38], y: 1.8, w: 1, h: 1.5, subject: "theotokos" },
    { type: "icon", at: [-4.2, 5.02], y: 1.8, w: 1, h: 1.5, subject: "saint" },
    { type: "icon", at: [4.2, 5.02], y: 1.8, w: 1, h: 1.5, subject: "saint" },
    { type: "icon", at: [-8.17, 6.2], y: 1.8, w: 1.1, h: 1.6, rot: 90, subject: "saint" },
    { type: "icon", at: [8.17, 6.2], y: 1.8, w: 1.1, h: 1.6, rot: -90, subject: "saint" },
    { type: "candle-table", at: [-3, 6.4] },
    { type: "chandelier", at: [0, 0], y: 11.6, top: 15 },
  ],
};


// Սուրբ Գրիգոր Առաջնորդանիստ եկեղեցի՝ տիրոջ լուսանկարներից (2026-11-27)։ ⚑ Ճշտել. բոլոր չափերը մոտավոր են
// (նկարների համամասնություններից), սրբապատկերների պատերը՝ նկարներից ենթադրված։ Եռանավ դահլիճ փայտե գերաններով
// առաստաղով, ամեն կողմում երեք ազատ սյուն, արևմտյան մուտքի վրա պատշգամբ (աստիճանը՝ հյուսիս-արևմտյան անկյունում),
// դրսից՝ նարնջագույն և սև տուֆի «շախմատ», բազալտե ցոկոլ, կղմինդր, հարավային կողմում՝ զանգակատուն-մուտք։
const SG = "/church3d/surb-grigor";
const SURB_GRIGOR: ChurchModelV2 = {
  version: 2,
  id: "surb-grigor",
  name: "Սուրբ Գրիգոր Առաջնորդանիստ (⚑ փորձ)",
  tuff: "ochre",
  look: { masonry: "checker", accent: "black", plinth: 0.7, roof: "tile", cornice: true },
  blocks: [
    {
      // Ներսը՝ եռանավ (դրսի տեսքը տալիս է «shell»-ը, որովհետև դրսից մեկ ընդհանուր երկթեք տանիք է)։
      id: "main", kind: "hall", name: "Եռանավ դահլիճ", part: "nav", partAt: [0, 1.6, 4], at: [0, 2], width: 12.8, length: 20, height: 8.6, ceiling: "beams", roof: "gable", rise: 3,
      aisles: { width: 3.2, height: 6.2, columns: 5 }, hide: ["outside"],
      doors: [{ wall: "west", w: 2, h: 3.2, part: "mutq" }],
      windows: [
        { wall: "south", y: 3.7, w: 0.9, h: 1.7, count: 4, gap: 4.4 },
        { wall: "north", y: 3.7, w: 0.9, h: 1.7, count: 4, gap: 4.4 },
        { wall: "west", at: -4.6, y: 4.2, w: 0.6, h: 1.4 }, { wall: "west", at: 4.6, y: 4.2, w: 0.6, h: 1.4 },
      ],
    },
    {
      id: "shell", kind: "hall", name: "Դրսի պատեր և տանիք", at: [0, 2], width: 12.8, length: 20, height: 7.4, ceiling: "flat", roof: "gable", rise: 3.2, hide: ["inside"],
      doors: [{ wall: "west", w: 2, h: 3.2 }],
      windows: [
        { wall: "south", y: 3.7, w: 0.9, h: 1.7, count: 4, gap: 4.4, frame: "hood" },
        { wall: "north", y: 3.7, w: 0.9, h: 1.7, count: 4, gap: 4.4, frame: "hood" },
        { wall: "west", at: -4.6, y: 4.2, w: 0.6, h: 1.4 }, { wall: "west", at: 4.6, y: 4.2, w: 0.6, h: 1.4 },
      ],
    },
    { id: "khoran", kind: "apse", name: "Խորան", parent: "main", wall: "east", width: 5.2, depth: 2.8, outside: "hidden" },
    // Ավանդատներ՝ կողային նավերի արևելյան դռներով (⚑ ճշտել)։ Դրսից երևում է «Արևելյան բարձր մասը»։
    { id: "avandatun-n", kind: "hall", name: "Հյուսիսային ավանդատուն", part: "avandatun", parent: "main", wall: "east", offset: 5.4, width: 1.8, length: 3, height: 4.5, ceiling: "flat", roof: "flat", linkW: 1, linkH: 2.2, hide: ["outside"] },
    { id: "avandatun-s", kind: "hall", name: "Հարավային ավանդատուն", part: "avandatun", parent: "main", wall: "east", offset: -5.4, width: 1.8, length: 3, height: 4.5, ceiling: "flat", roof: "flat", linkW: 1, linkH: 2.2, hide: ["outside"] },
    {
      id: "arevelk", kind: "hall", name: "Արևելյան բարձր մաս", parent: "shell", wall: "east", width: 13.6, length: 4.2, height: 8.4, ceiling: "flat", roof: "gable", ridge: "width", rise: 3.4, link: "none", hide: ["inside"],
      windows: [{ wall: "east", y: 5.6, w: 0.6, h: 1.4 }],
    },
    { id: "zangakatun", kind: "belfry", name: "Զանգակատուն (մուտքով)", parent: "shell", offset: [8.2, -1.5], tower: 7.6, towerSize: 3.2, porch: { w: 1.9, h: 3.4 }, radius: 1.2, columns: 8, height: 2.2 },
  ],
  bema: { outline: [[-3.2, -5.6], [3.2, -5.6], [3.2, -8], [2.6, -8, 2.6], [-2.6, -8], [-3.2, -8]], height: 1.1, stairs: "center", curtainTop: 7.8 },
  balconies: [{ outline: [[-3.2, 9.4], [3.2, 9.4], [3.2, 12], [-3.2, 12]], floor: 3.4, part: "das-hark", stairs: { at: [-5.4, 6.6], dir: [0, 1], width: 1 } }],
  items: [
    { type: "altar", at: [0, -9.2], y: 1.1 },
    { type: "gospel", at: [0.35, -9.1], y: 2.15, rot: 10 },
    { type: "chalice", at: [-0.45, -9.05], y: 2.15 },
    { type: "candlestick", at: [-2.7, -5.95], y: 1.1 },
    { type: "candlestick", at: [2.7, -5.95], y: 1.1 },
    { type: "icon", at: [0, -10.74], y: 2.2, w: 2.1, h: 2.58, shape: "rect", subject: "theotokos", image: `${SG}/astvatsatsin.webp`, name: "Սուրբ Աստվածածին Մանուկ Հիսուսով (Ավագ խորանի պատկերը)" },
    // Սրբապատկերներ՝ ⚑ ճշտել պատերը։
    { type: "icon", at: [-6.37, 4.2], y: 1.3, w: 1.45, h: 2.13, rot: 90, shape: "rect", subject: "christ", image: `${SG}/mkrtutyun.webp`, name: "Քրիստոսի Մկրտությունը" },
    { type: "icon", at: [6.37, 4.2], y: 1.3, w: 1.5, h: 1.95, rot: -90, shape: "rect", subject: "christ", image: `${SG}/khachelutyun.webp`, name: "Խաչելությունը" },
    { type: "icon", at: [6.37, -0.2], y: 1.3, w: 1.3, h: 1.8, rot: -90, shape: "rect", subject: "saint", image: `${SG}/bartoghimeos.webp`, name: "Սուրբ Բարթողիմեոս առաքյալ" },
    { type: "icon", at: [-4.0, -7.97], y: 1.3, w: 1.3, h: 1.77, shape: "rect", subject: "saint", image: `${SG}/tadeos.webp`, name: "Սուրբ Թադեոս առաքյալ" },
    { type: "icon", at: [4.0, -7.97], y: 1.3, w: 1.4, h: 1.76, shape: "rect", subject: "saint", image: `${SG}/grigor.webp`, name: "Սուրբ Գրիգոր (⚑ ճշտել՝ ով է)" },
    // Նստարաններ նավում (դեմքով դեպի խորան), երկար նստարաններ՝ մուտքի մոտ։
    ...[-3.6, -2.4, -1.2, 0, 1.2, 2.4, 3.6].flatMap((z) => [
      { type: "bench" as const, at: [-1.75, z] as const, rot: 180, w: 2.3 },
      { type: "bench" as const, at: [1.75, z] as const, rot: 180, w: 2.3 },
    ]),
    { type: "lectern", at: [1.6, -4.8], rot: -20 },
    { type: "candle-table", at: [3.6, 8.6] },
    { type: "candle-table", at: [-5.6, 2], rot: 90 },
    { type: "candle-table", at: [5.6, 2], rot: -90 },
    { type: "chandelier", at: [0, 4.4], y: 6.2, top: 11 },
    { type: "chandelier", at: [0, -3.2], y: 6.2, top: 11 },
  ],
};

/** Բլոկներով ձևանմուշները (v2)։ */
export const BLOCK_TEMPLATES: readonly ChurchModelV2[] = [CROSS_DOMED, SINGLE_NAVE, THREE_NAVE, ETCHMIADZIN, SURB_GRIGOR];
/** Նույնը՝ կառուցված ձևով (3D-ի և հին խմբագրիչի համար)։ */
export const TEMPLATES: readonly ChurchModel[] = BLOCK_TEMPLATES.map((template) => compileModel(template).model);
