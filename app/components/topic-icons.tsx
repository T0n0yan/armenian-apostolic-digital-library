import type { SVGProps } from "react";

/**
 * Topic icons: one line style (24 px grid, round 1.6 px strokes, currentColor) with a slow motion
 * that says what the topic is. Motions live in app.css (.ti-*) and stop for reduced motion.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Frame({ size = 24, children, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

/** Gospel teaching: books settling one onto another. */
export function BooksIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <g className="ti-book ti-book-1"><rect x="3.5" y="16.5" width="17" height="4" rx="1" /><path d="M6.5 16.5v4" /></g>
      <g className="ti-book ti-book-2"><rect x="5" y="11.5" width="14" height="4" rx="1" /><path d="M16 11.5v4" /></g>
      <g className="ti-book ti-book-3"><rect x="4" y="6.5" width="15" height="4" rx="1" /><path d="M7 6.5v4" /><path d="M11.5 3.5v3M10 5h3" /></g>
    </Frame>
  );
}

/** Prayers: hands joined in prayer, with light kindling above them. */
export function PrayerIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <g className="ti-glow"><path d="M12 1.8v1.6M8.6 3.1l.8 1.2M15.4 3.1l-.8 1.2" /></g>
      <path d="M12 6.5c-.9.4-1.5 1.3-1.6 2.4L10 14.5l-2.6 2.2a1.5 1.5 0 0 0-.4 1.7l1.3 3.1" />
      <path d="M12 6.5c.9.4 1.5 1.3 1.6 2.4l.4 5.6 2.6 2.2a1.5 1.5 0 0 1 .4 1.7l-1.3 3.1" />
      <path d="M12 6.5v8.5" />
    </Frame>
  );
}

/** Psalms: David's lyre with its strings trembling. */
export function LyreIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M6.5 4.5C4 7 4.5 12 7 15.5c1 1.4 1.5 2.6 1.5 4h7c0-1.4.5-2.6 1.5-4 2.5-3.5 3-8.5.5-11" />
      <path d="M6.5 4.5c1.6.8 3.5 1.2 5.5 1.2s3.9-.4 5.5-1.2" />
      <path d="M8 19.5h8" />
      <g className="ti-strings"><path className="ti-string ti-string-1" d="M10 6v13" /><path className="ti-string ti-string-2" d="M12 6.2V19" /><path className="ti-string ti-string-3" d="M14 6v13" /></g>
    </Frame>
  );
}

/** Lives of the saints: a dove in flight. */
export function DoveIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path className="ti-wing ti-wing-back" d="M12.5 10.5 16 4.5c1.5 2 1.8 4.4.6 6.4" />
      <path d="M3.5 13.5c2.4-.3 4.4-1.4 6-3 1.4-1.4 3.6-1.6 5.2-.5l1.6 1.1 3.2-.6-2.3 2.1c-.6 3.3-3.4 5.7-6.8 5.9l-3.4.2 1.6-2.2c-2.2.2-4-.7-5.1-3Z" />
      <path className="ti-wing ti-wing-front" d="M10.5 10.5 7 3.5c-1.8 2.4-1.8 5.4-.1 7.6" />
      <circle cx="16.4" cy="10.9" r=".4" fill="currentColor" />
    </Frame>
  );
}

/** Daily readings: a calendar whose page turns over. */
export function CalendarIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <g className="ti-page"><rect x="7" y="12" width="10" height="6" rx="1" /><path d="M9.5 15h5" /></g>
    </Frame>
  );
}

/** Questions from the Bible: an open book with a question rising from it. */
export function QuestionBookIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <path d="M12 20c-1.8-1.1-4.6-1.6-8.5-1.4V8.8c3.9-.2 6.7.3 8.5 1.4 1.8-1.1 4.6-1.6 8.5-1.4v9.8c-3.9-.2-6.7.3-8.5 1.4Z" />
      <path d="M12 10.2V20" />
      <g className="ti-question"><path d="M10.3 3.6a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.9.7-.9 1.3" /><circle cx="12" cy="8" r=".35" fill="currentColor" /></g>
    </Frame>
  );
}
