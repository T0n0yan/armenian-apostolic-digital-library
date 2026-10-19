import { useEffect, useState, type SVGProps } from "react";

/**
 * Topic icons in one 1.5px stroke style: IconOven (MIT) for the Gospel and questions, Hugeicons (MIT)
 * for prayer, and our own drawings for the lyre, the saint and the calendar. Each
 * draws itself in when it appears, then moves slowly in a way that says what the topic is. The
 * motions live in app.css (.ti-*) and stop when animations are turned off.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, "strokeWidth"> & { size?: number; strokeWidth?: number | string };

function Icon({ size = 24, motion, body, strokeWidth: _strokeWidth, className = "", ...props }: IconProps & { motion: string; body: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={`ti ${motion} ${className}`} {...props}
      // Every stroke gets pathLength=1 so the draw-in animation works the same for all shapes.
      dangerouslySetInnerHTML={{ __html: body.replace(/<(path|circle) /gu, '<$1 pathLength="1" class="ti-stroke" ') }} />
  );
}

/** Gospel teaching: the open Gospel with a cross; its pages stir. */
export function GospelIcon(props: IconProps) {
  return <Icon {...props} motion="ti-gospel" body={"<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"M12 7C9.75 5.25 6.5 4.5 2.75 4.75v13.5c3.75-.25 7 .5 9.25 2.25c2.25-1.75 5.5-2.5 9.25-2.25V4.75c-3.75-.25-7 .5-9.25 2.25m0 0v13M5.25 9.5H9m-3.75 3H9m-3.75 3h2.5m8.75-7V16m-2-5.25h4\"/>"} />;
}

/** Prayers: hands joined in prayer, softly glowing. */
export function PrayerIcon(props: IconProps) {
  return <Icon {...props} motion="ti-pray" body={"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><path d=\"M15.5 15L14 10.5c-1.657 0-2 1.343-2 3V15m-3.5 0l1.5-4.5c1.657 0 2 1.343 2 3V15\"/><path d=\"M21.978 22c-1.15-.67-3.086-2.186-5.69-1.992c-.659.049-.989.074-1.29.05a3 3 0 0 1-.327-.029C13.139 19.674 12 18.336 12 16.74V3.196a1.197 1.197 0 0 1 2.304-.453l2.718 6.644c1.066 2.605 1.599 3.907 2.528 4.577c.057.042.163.113.223.15c.971.606 1.39.606 2.227.606M2.022 22c1.15-.67 3.086-2.186 5.69-1.992c.659.049.989.074 1.29.05s.31-.025.327-.029C10.861 19.675 12 18.336 12 16.74V3.196a1.197 1.197 0 0 0-2.304-.453L6.978 9.388c-1.066 2.605-1.599 3.908-2.528 4.577a5 5 0 0 1-.223.15c-.971.606-1.39.606-2.227.606\"/></g>"} />;
}

/** Psalms: David's harp, its strings trembling. */
export function PsalmIcon(props: IconProps) {
  return <Icon {...props} motion="ti-harp" body={"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><path d=\"M7 4.2C4.9 5.8 4.5 9.4 6 12.3c1 1.9 2 3.4 2 5.7h8c0-2.3 1-3.8 2-5.7 1.5-2.9 1.1-6.5-1-8.1\"/><path d=\"M6.6 6.6c1.7.6 3.5.9 5.4.9s3.7-.3 5.4-.9\"/><path d=\"M8 18h8M9.5 21h5M12 18v3\"/><path d=\"M10 7.3V18M12 7.5V18M14 7.3V18\"/></g>"} />;
}

/** Lives of the saints: a face beneath a halo that floats and shines. */
export function SaintIcon(props: IconProps) {
  return <Icon {...props} motion="ti-halo" body={"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><circle cx=\"12\" cy=\"7.6\" r=\"5.4\" stroke-dasharray=\"1.6 1.4\"/><circle cx=\"12\" cy=\"8.2\" r=\"2.9\"/><path d=\"M5 21.2c0-3.9 3.1-7 7-7s7 3.1 7 7\"/><path d=\"M12 14.2v3.2M10.4 15.8h3.2\"/></g>"} />;
}

/** Daily readings: a calendar leaf showing today's date; the page turns over. */
export function CalendarIcon({ size = 24, strokeWidth: _strokeWidth, className = "", ...props }: IconProps) {
  const [day, setDay] = useState(() => new Date().getDate());
  useEffect(() => setDay(new Date().getDate()), []);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={`ti ti-calendar ${className}`} {...props}>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}>
        <rect className="ti-stroke" pathLength={1} x="3.5" y="5" width="17" height="15.5" rx="2.5" />
        <path className="ti-stroke" pathLength={1} d="M3.5 9.5h17M8 3v4M16 3v4" />
      </g>
      <text x="12" y="18.2" textAnchor="middle" fontSize="7.6" fontWeight="700" fill="currentColor" fontFamily="system-ui, sans-serif" suppressHydrationWarning>{day}</text>
    </svg>
  );
}

/** Questions from the Bible: a question that tilts as if wondering. */
export function QuestionIcon(props: IconProps) {
  return <Icon {...props} motion="ti-question" body={"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path stroke-width=\"1.5\" d=\"M12 3.25c4.85 0 8.75 3.5 8.75 7.85s-3.9 7.85-8.75 7.85c-1.1 0-2.15-.18-3.1-.5L4.6 20c-.6.2-1.15-.4-.9-.95l1.2-2.9c-1-1.4-1.65-3.15-1.65-5.05c0-4.35 3.9-7.85 8.75-7.85\"/><path stroke-width=\"1.5\" d=\"M9.75 9.1a2.25 2.25 0 1 1 3.1 2.08c-.5.2-.85.66-.85 1.2v.37\"/><path stroke-width=\"2\" d=\"M12 15.25h.01\"/></g>"} />;
}

/** Any other topic: a cross. */
export function CrossIcon(props: IconProps) {
  return <Icon {...props} motion="ti-cross" body={"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><path d=\"M10.75 2.75h2.5q.75 0 .75.75v1.25q0 .75.75.75h3.5q.75 0 .75.75v2.5q0 .75-.75.75h-3.5q-.75 0-.75.75v4.25q0 .75-.75.75h-2.5q-.75 0-.75-.75v-4.25q0-.75-.75-.75h-3.5Q5 9.5 5 8.75v-2.5q0-.75.75-.75h3.5q.75 0 .75-.75V3.5q0-.75.75-.75\"/><rect width=\"11\" height=\"3\" x=\"6.5\" y=\"18.25\" rx=\"1\"/></g>"} />;
}
