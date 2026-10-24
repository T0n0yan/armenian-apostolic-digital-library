const ARMENIAN_MONTHS = [
  "հունվարի",
  "փետրվարի",
  "մարտի",
  "ապրիլի",
  "մայիսի",
  "հունիսի",
  "հուլիսի",
  "օգոստոսի",
  "սեպտեմբերի",
  "հոկտեմբերի",
  "նոյեմբերի",
  "դեկտեմբերի",
] as const;

export function formatArmenianDate(value: string | null) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;

  const month = ARMENIAN_MONTHS[Number(match[2]) - 1];
  const day = Number(match[3]);
  if (!month || day < 1 || day > 31) return null;

  return `${day} ${month}, ${match[1]}`;
}

/**
 * "24 հոկտեմբերի" and "09:05" from the phone's local time. Spelled out here because some phones'
 * browsers have no Armenian calendar data and print "M10" for toLocaleString("hy-AM").
 */
export function formatDayMonth(date: Date) {
  return `${date.getDate()} ${ARMENIAN_MONTHS[date.getMonth()]}`;
}

export function formatClock(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
