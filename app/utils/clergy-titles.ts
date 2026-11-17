/**
 * Clergy ranks of the Armenian Apostolic Church as /place asks for them, each with the way a
 * name is written with its address and abbreviation (the owner's list; ⚑ for clergy review).
 */
export const CLERGY_RANKS = [
  { role: "Արքեպիսկոպոս", write: (name: string, surname: string) => `Գերաշնորհ Տ. ${name} արք. ${surname}` },
  { role: "Եպիսկոպոս", write: (name: string, surname: string) => `Գերաշնորհ Տ. ${name} եպս. ${surname}` },
  { role: "Ծայրագույն վարդապետ", write: (name: string, surname: string) => `Հոգեշնորհ Տ. ${name} ծ.վրդ. ${surname}` },
  { role: "Վարդապետ", write: (name: string, surname: string) => `Հոգեշնորհ Տ. ${name} վրդ. ${surname}` },
  { role: "Աբեղա", write: (name: string, surname: string) => `Հոգեշնորհ Տ. ${name} աբղ. ${surname}` },
  { role: "Ավագ քահանա", write: (name: string, surname: string) => `Արժանապատիվ Տ. ${name} ավգ. քհն. ${surname}` },
  { role: "Հոգևոր հովիվ", write: (name: string, surname: string) => `Արժանապատիվ Տ. ${name} քհն. ${surname}` },
  { role: "Ծիսակատար քահանա", write: (name: string, surname: string) => `Արժանապատիվ Տ. ${name} քհն. ${surname}` },
  { role: "Սարկավագ", write: (name: string, surname: string) => `Բարեշնորհ ${name} սրկ. ${surname}` },
  { role: "Կիսասարկավագ", write: (name: string, surname: string) => `${name} ${surname}` },
  { role: "Դպիր", write: (name: string, surname: string) => `Քաղցրաշնորհ ${name} դպր. ${surname}` },
  { role: "Սպասավոր", write: (name: string, surname: string) => `${name} ${surname}` },
] as const;

// Already written with an address or a rank's abbreviation: kept as the reader typed it.
const TITLED = /(^|\s)(Տ\.|Տեր|Գերաշնորհ|Հոգեշնորհ|Արժանապատիվ|Բարեշնորհ|Քաղցրաշնորհ|Սրբազան)(\s|$)|(արք|եպս|վրդ|աբղ|քհն|սրկ|դպր)\./u;

// Նույն աստիճանի այլ անվանումներ, որ ադմինը կարող է գրել տողի սկզբում։
const ROLE_ALIASES: Record<string, string> = { "քահանա": "Ծիսակատար քահանա", "արքեպիսկոպոս": "Արքեպիսկոպոս", "ավագ սարկավագ": "Սարկավագ" };

/** Աստիճանը ըստ անվան (մեծատառ/փոքրատառ կարևոր չէ), կամ undefined։ */
function findRank(role: string) {
  const key = role.trim().toLocaleLowerCase("hy");
  const alias = ROLE_ALIASES[key];
  return CLERGY_RANKS.find((item) => item.role.toLocaleLowerCase("hy") === key || item.role === alias);
}

/** «Հովհաննես Աբրահամյան» as a Ավագ քահանա → «Արժանապատիվ Տ. Հովհաննես ավգ. քհն. Աբրահամյան». */
export function clergyName(role: string, typed: string) {
  const text = typed.trim().replace(/\s+/gu, " ");
  const rank = findRank(role);
  if (!rank || !text || TITLED.test(text)) return text;
  const [name, ...rest] = text.split(" ");
  return rank.write(name, rest.join(" ")).replace(/\s+/gu, " ").trim();
}

/** How a name of this rank will look, for the question that asks it. */
export function clergyExample(role: string) {
  const rank = CLERGY_RANKS.find((item) => item.role === role);
  return rank ? `Գրեք անունը և ազգանունը, օրինակ՝ Հովհաննես Աբրահամյան։\nԿայքում կգրվի՝ ${rank.write("Հովհաննես", "Աբրահամյան").replace(/\s+/gu, " ")}` : "";
}

/**
 * Ծառայողների ամբողջ տեքստը (մեկ դեր՝ մեկ տող)՝ «Սարկավագ՝ Կարեն Առաքելյան» →
 * «Սարկավագ՝ Բարեշնորհ Կարեն սրկ. Առաքելյան»։ Արդեն դիմելաձևով գրված անունները և անծանոթ
 * դերերի տողերը («Թեմի Առաջնորդ՝ …») մնում են ինչպես կան։ Ստորակետով մի քանի անուն՝ ամեն մեկը։
 */
export function formatClergy(text: string) {
  return text.split("\n").map((line) => {
    const match = /^(\s*(?:[•\-–]\s*)?)([^՝:`']{2,40}?)\s*[՝:`']\s*(.+)$/u.exec(line.replace(/[\u200b-\u200d\ufeff]/gu, ""));
    if (!match || !findRank(match[2])) return line;
    const [, bullet, role, names] = match;
    return `${bullet}${role.trim()}՝ ${names.replace(/[։:.]\s*$/u, "").split(/\s*,\s*/u).map((name) => clergyName(role, name)).join(", ")}`;
  }).join("\n");
}
