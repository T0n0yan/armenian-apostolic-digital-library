// Պատարագամատույց (`liturgy_lines`, migration 0062)։ Տող = մաս · ով է ասում · գրաբար · աշխարհաբար · ցուցում · բացատրություն։

export const SPEAKERS = {
  priest: "Քահանա",
  deacon: "Սարկավագ",
  people: "Ժողովուրդ",
  choir: "Դպիրներ",
  all: "Բոլորը",
} as const;
export type Speaker = keyof typeof SPEAKERS;
export const isSpeaker = (value: unknown): value is Speaker => typeof value === "string" && value in SPEAKERS;
/** Ժողովրդի պատասխանները ընդգծվում են (ինքնուրույն հետևելիս)։ */
export const isPeople = (speaker: Speaker) => speaker === "people" || speaker === "all";

export type LiturgyLine = {
  id: number; sort: number; part: string; speaker: Speaker;
  grabar: string; ashkharhabar: string; rubric: string; note: string; start: number | null;
};

export type ChurchAudio = { id: string; url: string; size: number };

/** Ձայնագրության հասցեն (R2 church/…). ?v=՝ չափը. սեղմելուց հետո (optimize-videos.ts) հղումը փոխվում է, ու քեշը հինը չի տալիս։ */
export const churchAudioUrl = (objectKey: string, size?: number) => `/church-media/${objectKey.replace(/^church\//u, "")}${size ? `?v=${size}` : ""}`;

/** Ո՞ր տողն է հնչում. վերջին տողը, որի սկիզբը ≤ ժամանակ (առանց նշված ժամանակի տողերը բաց են թողնվում)։ */
export function lineAt(lines: Array<{ start: number | null }>, time: number) {
  let found = -1;
  lines.forEach((line, index) => { if (line.start !== null && line.start <= time + 0.05) found = index; });
  return found;
}

/** Տողերը՝ խմբավորված ըստ մասի (հաջորդական նույն անունները՝ մեկ խումբ)։ */
export function groupByPart<T extends { part: string }>(lines: T[]) {
  const groups: Array<{ part: string; lines: Array<T & { index: number }> }> = [];
  lines.forEach((line, index) => {
    const last = groups.at(-1);
    if (last && last.part === line.part) last.lines.push({ ...line, index });
    else groups.push({ part: line.part, lines: [{ ...line, index }] });
  });
  return groups;
}
