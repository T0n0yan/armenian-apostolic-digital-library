// Եկեղեցու հատակագիծը (խաչաձև գմբեթավոր տիպ)։ 3D պատերը և SVG հատակագիծը կառուցվում են նույն թվերից։
// Կետը՝ [x, z] (մետր). x՝ հյուսիս (−) / հարավ (+), z՝ արևելք (−) / արևմուտք (+)։

export type P2 = readonly [number, number];

/** Պատի բացվածք (դուռ). `from`/`to`՝ մետր պատի սկզբից, `top`՝ բարձրությունը։ */
export type Opening = { from: number; to: number; top: number };

export type Room = {
  id: string;
  points: readonly P2[];
  height: number;
  /** Պատի համարը (կետ i → i+1) → դռներ։ */
  doors?: Readonly<Record<number, readonly Opening[]>>;
  /** Հարթ առաստաղ (չկա՝ կամարներ, ինչպես գլխավոր դահլիճում)։ */
  flatCeiling: boolean;
};

export const APSE_CENTER: P2 = [0, -4];
export const APSE_RADIUS = 4;
export const WALL_HEIGHT = 9;
export const DRUM_RADIUS = 3.6;
export const DRUM_BOTTOM = 13;
export const DRUM_TOP = 16;
export const BEMA_FRONT = -3;
export const BEMA_HEIGHT = 1.3;

const APSE_STEPS = 12;

function apseArc(): P2[] {
  const points: P2[] = [];
  for (let i = 1; i < APSE_STEPS; i++) {
    const angle = (Math.PI * i) / APSE_STEPS;
    points.push([APSE_RADIUS * Math.cos(angle), APSE_CENTER[1] - APSE_RADIUS * Math.sin(angle)]);
  }
  return points;
}

/** Գլխավոր դահլիճ՝ խաչ (4 թև) + խորանի կիսաշրջան։ */
const MAIN: P2[] = [
  [-4, 11], [4, 11], [4, 4], [7, 4], [7, -4], [4, -4],
  ...apseArc(),
  [-4, -4], [-7, -4], [-7, 4], [-4, 4],
];

export const ROOMS: readonly Room[] = [
  {
    id: "main", points: MAIN, height: WALL_HEIGHT, flatCeiling: false,
    doors: {
      0: [{ from: 3, to: 5, top: 3.2 }],
      // Թևերի արևելյան պատերից՝ դռներ դեպի ավանդատներ։
      4: [{ from: 1, to: 2.2, top: 2.4 }],
      [MAIN.length - 4]: [{ from: 0.8, to: 2, top: 2.4 }],
    },
  },
  {
    id: "avandatun-n", height: 6, flatCeiling: true,
    points: [[-7, -4.4], [-4.4, -4.4], [-4.4, -8.4], [-7, -8.4]],
    doors: { 0: [{ from: 1, to: 2.2, top: 2.4 }] },
  },
  {
    id: "avandatun-s", height: 6, flatCeiling: true,
    points: [[4.4, -4.4], [7, -4.4], [7, -8.4], [4.4, -8.4]],
    doors: { 0: [{ from: 0.4, to: 1.6, top: 2.4 }] },
  },
  {
    id: "gavit", height: 6, flatCeiling: true,
    points: [[-5, 17], [5, 17], [5, 11.4], [-5, 11.4]],
    doors: { 0: [{ from: 4, to: 6, top: 3 }], 2: [{ from: 4, to: 6, top: 3.2 }] },
  },
];

/** Արտաքին ուրվագիծ (պատերի հաստությամբ)։ */
export const OUTLINE = {
  main: { x: 7.4, east: -8.8, west: 11.4, height: 9.4 },
  gavit: { x: 5.4, east: 11.4, west: 17.4, height: 6.4 },
} as const;
