/** Անձնական նամակ՝ տիրոջից մեկ մարդու։ Երևում է միայն տիրոջը և ստացողին (/namak)։ */
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

/** Երևանի այսօրվա օրը (UTC+4, առանց ամառային ժամի)։ */
export function yerevanDay(now = Date.now()) {
  return new Date(now + 4 * 60 * 60_000).toISOString().slice(0, 10);
}

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

/** Ստացողը տեսնու՞մ է նամակը. միայն իր հաշվով, միայն երբ տեքստ կա և օրը եկել է։ */
export function letterVisibleTo(letter: PrivateLetter, userId: string | null | undefined, today = yerevanDay()) {
  if (!userId || !letter.body.trim() || !letter.recipientIds.includes(userId)) return false;
  return !letter.visibleFrom || letter.visibleFrom <= today;
}

/** Ստացողին նշելու տողը՝ ստորակետով. էլ. հասցեներ և @username-ներ, փոքրատառ։ */
export function parseRecipientInput(input: string) {
  return [...new Set(input.split(/[,\s]+/u).map((item) => item.trim().toLowerCase()).filter(Boolean))].slice(0, 5);
}
