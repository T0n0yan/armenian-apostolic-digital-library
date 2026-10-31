/**
 * A reminder as an event in the phone's own calendar: the phone rings it, offline too, and the
 * server sends nothing. iPhones open an .ics file ("Add to Calendar"); Android phones get Google
 * Calendar's "new event" page as well, since many of them don't open .ics files themselves.
 */

export type CalendarRepeat = "none" | "daily" | "weekly" | "monthly" | "yearly";

export type CalendarEvent = {
  title: string;
  /** The material's own address on the site ("/pray/71"). */
  path: string;
  start: Date;
  repeat: CalendarRepeat;
};

const RULES: Record<Exclude<CalendarRepeat, "none">, string> = {
  daily: "FREQ=DAILY", weekly: "FREQ=WEEKLY", monthly: "FREQ=MONTHLY", yearly: "FREQ=YEARLY",
};
const pad = (value: number) => String(value).padStart(2, "0");

/** The phone's local time without a zone ("20261025T070000"): a daily 7:00 stays 7:00 everywhere. */
export function floatingTime(date: Date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

export function calendarRule(repeat: CalendarRepeat) {
  return repeat === "none" ? null : RULES[repeat];
}

/** The site's address of the .ics file for this event (served by /api/calendar). */
export function calendarFileUrl(origin: string, event: CalendarEvent) {
  const url = new URL("/api/calendar", origin);
  url.searchParams.set("title", event.title.slice(0, 120));
  url.searchParams.set("path", event.path);
  url.searchParams.set("start", floatingTime(event.start));
  url.searchParams.set("repeat", event.repeat);
  return url.toString();
}

/** Text as an iCalendar value: backslash, comma, semicolon and line breaks escaped. */
function escapeText(value: string) {
  return value.replace(/[\\;,]/gu, (character) => `\\${character}`).replace(/\r?\n/gu, "\\n");
}

/** iCalendar lines are at most 75 bytes; longer ones continue on the next line after a space. */
function fold(line: string) {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  for (const character of line) {
    if (encoder.encode(current + character).length > (parts.length ? 74 : 75)) { parts.push(current); current = character; }
    else current += character;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** The .ics file: one event with an alert at its own time. */
export function calendarFile(event: { title: string; url: string; start: string; repeat: CalendarRepeat; uid: string; stamp: Date }) {
  const stamp = event.stamp.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}/u, "");
  const rule = calendarRule(event.repeat);
  const summary = escapeText(`🙏 ${event.title}`);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//apostolic.am//Hogevor zharangutyun//HY",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${event.start}`,
    "DURATION:PT15M",
    `SUMMARY:${summary}`,
    `DESCRIPTION:${escapeText(`Հոգևոր ժառանգություն\n${event.url}`)}`,
    `URL:${event.url}`,
    ...(rule ? [`RRULE:${rule}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${summary}`,
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].map(fold).join("\r\n") + "\r\n";
}
