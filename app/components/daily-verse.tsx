import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import { DAILY_VERSES, type DailyVerse } from "../data/daily-verses";

/** The reader's calendar day as a number (local midnight), so the verse turns over at midnight. */
function dayNumber(date = new Date()) {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
}

/**
 * The verse for a day: the list is walked in a fixed shuffled order, so consecutive days come
 * from different books and a verse returns only after all the others have been shown.
 */
export function verseForDay(day: number): DailyVerse {
  const count = DAILY_VERSES.length;
  // A step coprime with the count visits every verse once per cycle, in a scattered order.
  let step = Math.floor(count * 0.618) || 1;
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  while (gcd(step, count) !== 1) step += 1;
  return DAILY_VERSES[((day % count) * step + 7) % count];
}

/** «Աստվածաշունչն ասում է…» — a short verse that changes every day, on the home page. */
export function DailyVerseCard() {
  // Server render picks by UTC; the reader's own day replaces it after hydration.
  const [verse, setVerse] = useState(() => verseForDay(Math.floor(Date.now() / 86_400_000)));
  useEffect(() => setVerse(verseForDay(dayNumber())), []);
  return (
    <section className="frosted-panel relative mx-auto grid w-full max-w-[640px] justify-items-center gap-3 overflow-hidden px-6 pt-6 pb-5 text-center" aria-label="Աստվածաշունչն ասում է">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(ellipse_at_top,rgb(240_211_151/22%),transparent_70%)]" aria-hidden="true" />
      <span className="relative text-[11px] font-bold tracking-[2.4px] text-gold uppercase">Աստվածաշունչն ասում է…</span>
      <blockquote className="relative m-0 font-book text-[19px] leading-[1.6] text-ink [text-wrap:balance] min-[560px]:text-[21px]">
        «{verse.text.replace(/^«|»$/gu, "")}»
      </blockquote>
      <a className="relative inline-flex items-center gap-1.5 text-[13px] font-semibold text-gold-bright no-underline hover:underline" href={verse.url} target="_blank" rel="noreferrer">
        {verse.reference} <ExternalLink aria-hidden="true" size={13} />
      </a>
    </section>
  );
}
