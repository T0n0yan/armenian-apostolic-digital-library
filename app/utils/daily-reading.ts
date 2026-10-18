export type DailyReadingSummary = {
  /** The feast or commemoration line (e.g. "ՊԱՀՈՑ ՕՐ"); null for ordinary days. */
  feast: string | null;
  /** Scripture references listed under "Օրվա ընթերցումները". */
  readings: string[];
};

const readingsHeading = /^օրվա ընթերցումներ/iu;
const dateLine = /^\d{1,2}\s+\p{L}+,?\s+\d{4}$/u;

/**
 * Reads a daily-reading post: date line, optional feast line, optional intro, then
 * "Օրվա ընթերցումները" with "- Book chapter.verse" items.
 */
export function summarizeDailyReading(text: string): DailyReadingSummary | null {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const headingIndex = lines.findIndex((line) => readingsHeading.test(line));
  const readings: string[] = [];
  if (headingIndex >= 0) {
    for (const line of lines.slice(headingIndex + 1)) {
      if (!line.startsWith("-") && !line.startsWith("•")) break;
      readings.push(line.replace(/^[-•]\s*/u, "").trim());
    }
  }
  const head = lines.slice(0, headingIndex >= 0 ? headingIndex : 3).filter((line) => !dateLine.test(line));
  const feastLine = head.find((line) => line.length <= 160 && line === line.toLocaleUpperCase("hy") && /\p{L}/u.test(line));
  if (!feastLine && readings.length === 0) return null;
  return { feast: feastLine ?? null, readings };
}

const months = ["հունվար", "փետրվար", "մարտ", "ապրիլ", "մայիս", "հունիս", "հուլիս", "օգոստոս", "սեպտեմբեր", "հոկտեմբեր", "նոյեմբեր", "դեկտեմբեր"];
const weekdays = ["Կիրակի", "Երկուշաբթի", "Երեքշաբթի", "Չորեքշաբթի", "Հինգշաբթի", "Ուրբաթ", "Շաբաթ"];

/** Day number, Armenian month name and weekday for a YYYY-MM-DD date. */
export function calendarParts(isoDate: string | null) {
  const match = isoDate ? /^(\d{4})-(\d{2})-(\d{2})/u.exec(isoDate) : null;
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return { day: Number(match[3]), month: months[Number(match[2]) - 1], weekday: weekdays[date.getUTCDay()], year: Number(match[1]) };
}
