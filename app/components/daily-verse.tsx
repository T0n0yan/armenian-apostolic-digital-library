import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import { DAILY_VERSES, type DailyVerse } from "../data/daily-verses";
import { readPreference } from "../utils/preferences";

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
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setVerse(verseForDay(dayNumber()));
    setHidden(readPreference("dailyVerse") === "off");
  }, []);
  if (hidden) return null;
  return (
    <section className="daily-verse relative mx-auto grid w-full max-w-[600px] justify-items-center gap-2.5 px-5 pt-5 pb-4 text-center" aria-label="Աստվածաշունչն ասում է">
      <span className="flex w-full items-center gap-3 text-gold" aria-hidden="true">
        <span className="h-px flex-1 bg-[linear-gradient(90deg,transparent,rgb(217_181_111/60%))]" />
        <svg width="14" height="14" viewBox="0 0 12 12" fill="currentColor"><path d="M5.2 0h1.6v4.4H11V6H6.8v6H5.2V6H1V4.4h4.2Z" /></svg>
        <span className="h-px flex-1 bg-[linear-gradient(90deg,rgb(217_181_111/60%),transparent)]" />
      </span>
      <span className="text-[10.5px] font-bold tracking-[2.6px] text-gold uppercase">Աստվածաշունչն ասում է</span>
      <blockquote className="m-0 max-w-[34ch] font-book text-[18px] leading-[1.65] text-ink [text-wrap:balance] min-[560px]:text-[20px]">
        {/* Verses that already quote a speaker keep their own quotation marks. */}
        {verse.text.includes("«") ? verse.text : `«${verse.text}»`}
      </blockquote>
      <a className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(217_181_111/30%)] px-3 py-1 text-[12px] font-semibold tracking-[0.3px] text-gold-bright no-underline hover:bg-[rgb(217_181_111/10%)]" href={verse.url} target="_blank" rel="noreferrer">
        {verse.reference} <ExternalLink aria-hidden="true" size={12} />
      </a>
    </section>
  );
}
