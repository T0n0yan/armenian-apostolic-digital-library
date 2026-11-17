/** Ժամերի ընտրիչի (ադմինի խմբագրիչ) պատրաստի տարբերակները և տողի կազմումը։ */
export type ScheduleKind = "liturgy" | "services" | "hours";

export const SCHEDULE_DAYS = ["Ամեն օր", "Երկուշաբթիից շաբաթ", "Երկուշաբթիից ուրբաթ", "Շաբաթ", "Կիրակի", "Շաբաթ և կիրակի", "Տոն օրերին"] as const;

export const SCHEDULE_PRESETS: Record<ScheduleKind, { day: string; slots: string[]; quick: string[]; ranges: boolean }> = {
  liturgy: { day: "Կիրակի", slots: ["08:00", "09:00", "10:00", "10:30", "11:00", "12:00", "18:00"], quick: ["Տոն օրերին", "Չի մատուցվում"], ranges: false },
  services: { day: "Երկուշաբթիից շաբաթ", slots: ["09:00–09:30", "09:30–10:00", "10:00–10:30", "17:00–17:30", "18:00–18:30"], quick: ["Չեն կատարվում"], ranges: true },
  hours: { day: "Ամեն օր", slots: ["08:00–18:00", "09:00–18:00", "09:30–18:30", "09:00–20:00", "10:00–17:00"], quick: ["Միշտ բաց է"], ranges: true },
};

/** «10:00, 11:00 և 12:00»՝ ժամերը ըստ հերթականության, վերջինը «և»-ով։ */
export function joinSlots(slots: string[]) {
  const sorted = [...new Set(slots)].sort();
  if (sorted.length < 2) return sorted.join("");
  return `${sorted.slice(0, -1).join(", ")} և ${sorted[sorted.length - 1]}`;
}

/** «Կիրակի 10:00 և 12:00»։ Առանց ժամի՝ միայն օրը։ */
export function scheduleLine(day: string, slots: string[]) {
  return [day.trim(), joinSlots(slots)].filter(Boolean).join(" ");
}

/** «9:30»-ը՝ «09:30», «9:30-18.30»-ի պես ձեռքով գրվածը՝ «09:30–18:30»։ null՝ ժամ չէ։ */
export function normalizeSlot(text: string) {
  const time = (value: string) => {
    const match = /^(\d{1,2})[:.](\d{2})$/u.exec(value.trim());
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  };
  const parts = text.split(/\s*[-–—]\s*/u);
  if (parts.length === 1) return time(parts[0]);
  if (parts.length !== 2) return null;
  const [from, to] = parts.map(time);
  return from && to ? `${from}–${to}` : null;
}

/** Նոր տողը ավելացնում է դաշտի վերջում (նույն տողը երկրորդ անգամ չի ավելանում)։ */
export function appendLine(current: string, line: string) {
  const lines = current.split("\n").map((item) => item.trim()).filter(Boolean);
  if (!line.trim() || lines.includes(line.trim())) return lines.join("\n");
  return [...lines, line.trim()].join("\n");
}
