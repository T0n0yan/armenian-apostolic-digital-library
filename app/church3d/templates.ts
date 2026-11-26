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

/** Բլոկներով ձևանմուշները (v2)։ */
export const BLOCK_TEMPLATES: readonly ChurchModelV2[] = [CROSS_DOMED, SINGLE_NAVE, THREE_NAVE];
/** Նույնը՝ կառուցված ձևով (3D-ի և հին խմբագրիչի համար)։ */
export const TEMPLATES: readonly ChurchModel[] = BLOCK_TEMPLATES.map((template) => compileModel(template).model);
