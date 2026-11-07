import { STORY_IMAGES } from "./story-backgrounds.generated";

// Նկարով կիսվելու ֆոները. տիրոջ նկարները (`public/story-bg/`) և մի քանի գունային ֆոն։

export type StoryBackground = {
  id: string;
  /** Նկարը (1080×1920 webp), գունային ֆոնի դեպքում՝ չկա։ */
  src?: string;
  thumb?: string;
  /** Գունային ֆոն՝ վերևից ներքև։ */
  gradient?: [string, string];
  tone: "dark" | "light";
  /** Նկարի ներքևում արդեն կա apostolic.am. գունային ֆոնին այն նկարում ենք մենք։ */
  hasMark: boolean;
};

const GRADIENTS: StoryBackground[] = [
  { id: "g-night", gradient: ["#2b1638", "#0f0a18"], tone: "dark", hasMark: false },
  { id: "g-wine", gradient: ["#5a1a24", "#200a10"], tone: "dark", hasMark: false },
  { id: "g-parchment", gradient: ["#f6ecd6", "#e2cfa6"], tone: "light", hasMark: false },
];

export const STORY_BACKGROUNDS: StoryBackground[] = [
  ...STORY_IMAGES.map((image) => ({
    id: image.id,
    src: `/story-bg/${image.id}.webp`,
    thumb: `/story-bg/thumbs/${image.id}.webp`,
    tone: image.tone,
    hasMark: true,
  })),
  ...GRADIENTS,
];

/** Տեքստի տարածքը 1080×1920 նկարի վրա. վերևը՝ story-ի կոճակների, ներքևը՝ apostolic.am-ի համար։ */
export const STORY_BOX = { left: 104, right: 1080 - 104, top: 300, bottom: 1920 - 330 };
