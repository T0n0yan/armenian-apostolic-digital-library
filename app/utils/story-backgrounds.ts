// Նկարով կիսվելու ֆոները (`public/story-bg/`, ստեղծվում են scripts/make-story-backgrounds.py-ով)։
// Ամեն ձևավորում ունի մուգ և բաց տարբերակ։ Ներքևում apostolic.am-ը արդեն նկարված է ֆոնի վրա։

import type { StoryBox } from "./story-layout";

export type StoryTone = "dark" | "light";

export type StoryDesign = {
  id: string;
  label: string;
  /** Տեքստի տարածքը 1080×1920 նկարի վրա. զարդը (գմբեթ, մոմ, խաչ) և apostolic.am-ը չեն ծածկվում։ */
  box: StoryBox;
};

export type StoryBackground = { id: string; design: StoryDesign; tone: StoryTone; src: string; thumb: string };

const TOP = 300; // story-ի վերևի կոճակները
const BOTTOM = 1590; // apostolic.am-ից վերև
const SIDE = 104;

export const STORY_DESIGNS: StoryDesign[] = [
  { id: "dome", label: "Գմբեթ", box: { left: SIDE, right: 1080 - SIDE, top: 600, bottom: BOTTOM } },
  { id: "chandelier", label: "Ջահ", box: { left: SIDE, right: 1080 - SIDE, top: 640, bottom: BOTTOM } },
  { id: "candle", label: "Մոմ", box: { left: 200, right: 1080 - SIDE, top: TOP, bottom: BOTTOM } },
  { id: "cross", label: "Խաչ", box: { left: SIDE, right: 770, top: TOP, bottom: BOTTOM } },
  { id: "lamp", label: "Կանթեղ", box: { left: 150, right: 1080 - SIDE, top: TOP, bottom: BOTTOM } },
  { id: "church", label: "Եկեղեցի", box: { left: SIDE, right: 1080 - SIDE, top: TOP, bottom: 1040 } },
  { id: "tower", label: "Զանգակատուն", box: { left: SIDE, right: 1080 - SIDE, top: TOP, bottom: 1170 } },
];

export function storyBackground(designId: string | undefined, tone: StoryTone): StoryBackground {
  const design = STORY_DESIGNS.find((entry) => entry.id === designId) ?? STORY_DESIGNS[0];
  const name = `${design.id}-${tone}`;
  return { id: name, design, tone, src: `/story-bg/${name}.webp`, thumb: `/story-bg/thumbs/${name}.webp` };
}
