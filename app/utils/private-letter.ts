/** Անձնական չատի (/namak) երկրորդ կողմը։ title/body/visibleFrom-ը նախկին նամակից են (այլևս չեն ցուցադրվում)։ */
export type PrivateLetter = {
  /** Ստացողի բոլոր հաշիվները (Google և դրան կապված Telegram)։ */
  recipientIds: string[];
  /** Ինչպես է տերը նշել ստացողին (էլ. հասցե կամ @username), միայն տիրոջ համար։ */
  recipientLabel: string;
  title: string;
  body: string;
  /** Երևանի օրը (YYYY-MM-DD), որից ստացողը տեսնում է նամակը. դատարկ՝ միանգամից։ */
  visibleFrom: string;
  updatedAt: string;
};

export const EMPTY_LETTER: PrivateLetter = { recipientIds: [], recipientLabel: "", title: "", body: "", visibleFrom: "", updatedAt: "" };

export function parseLetter(json: string | null | undefined): PrivateLetter {
  try {
    const value = JSON.parse(json ?? "{}") as Partial<PrivateLetter>;
    return {
      recipientIds: Array.isArray(value.recipientIds) ? value.recipientIds.filter((id): id is string => typeof id === "string") : [],
      recipientLabel: typeof value.recipientLabel === "string" ? value.recipientLabel : "",
      title: typeof value.title === "string" ? value.title : "",
      body: typeof value.body === "string" ? value.body : "",
      visibleFrom: typeof value.visibleFrom === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value.visibleFrom) ? value.visibleFrom : "",
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    };
  } catch {
    return EMPTY_LETTER;
  }
}

/** Ստացողին նշելու տողը՝ ստորակետով. էլ. հասցեներ և @username-ներ, փոքրատառ։ */
export function parseRecipientInput(input: string) {
  return [...new Set(input.split(/[,\s]+/u).map((item) => item.trim().toLowerCase()).filter(Boolean))].slice(0, 5);
}
