import { useEffect, useState, type SVGProps } from "react";

/**
 * Topic icons in one 1.5px stroke style: IconOven (MIT) for the Gospel and questions, and our own drawings
 * for the candle, the lyre, the saint and the calendar (the Gospel's lines are ours too). Each
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

/** Gospel teaching: the open Gospel, its lines following the curve of the pages, with a cross. */
export function GospelIcon(props: IconProps) {
  return <Icon {...props} motion="ti-gospel" body={"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><path d=\"M12 7C9.75 5.25 6.5 4.5 2.75 4.75v13.5c3.75-.25 7 .5 9.25 2.25c2.25-1.75 5.5-2.5 9.25-2.25V4.75c-3.75-.25-7 .5-9.25 2.25m0 0v13\"/><path d=\"M5.2 8.7c1.4 0 2.8.35 4.1 1M5.2 11.7c1.4 0 2.8.35 4.1 1M5.2 14.7c.9 0 1.8.15 2.7.45\"/><path d=\"M16.75 8.5v7.2M14.75 10.9c1.3-.35 2.7-.45 4-.3\"/></g>"} />;
}

/** Prayers: a church candle whose light shines out. */
export function PrayerIcon(props: IconProps) {
  return <Icon {...props} motion="ti-pray" body={"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><path d=\"M12 2.8c1.7 2.1 2.3 3.5 2.3 4.6a2.3 2.3 0 0 1-4.6 0c0-1.1.6-2.5 2.3-4.6Z\"/><path d=\"M12 9.7v1.3M9.8 11h4.4v8.5H9.8ZM6.5 19.5h11l-1.2 2H7.7Z\"/><path d=\"M5.5 6.5l1.4.6M18.5 6.5l-1.4.6M6.2 3.6l1.2 1.1M17.8 3.6l-1.2 1.1\"/></g>"} />;
}

/** Psalms: David's lyre, its strings trembling. */
export function PsalmIcon(props: IconProps) {
  return <Icon {...props} motion="ti-harp" body={"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><path d=\"M9 19.5C6.2 18 4.8 14.6 5.5 11.4c.5-2.3 2-3.2 1.5-5.8c-.2-1-1-1.6-2-1.3M15 19.5c2.8-1.5 4.2-4.9 3.5-8.1c-.5-2.3-2-3.2-1.5-5.8c.2-1 1-1.6 2-1.3\"/><path d=\"M6.6 7.4h10.8M8.5 19.5h7\"/><path d=\"M10 7.4v12.1M12 7.4v12.1M14 7.4v12.1\"/></g>"} />;
}

/**
 * Lives of the saints: a head inside a round golden halo, as on the icons.
 * To adjust it: HALO_Y moves the head and halo up or down together (bigger = lower), HALO_R is the
 * halo's size and HEAD_R the head's; the halo stays an even ring around the head.
 */
const HALO_Y = 9.6;
const HALO_R = 5.8;
const HEAD_R = 2.9;
export function SaintIcon(props: IconProps) {
  return <Icon {...props} motion="ti-halo" body={`<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><circle cx="12" cy="${HALO_Y}" r="${HALO_R}" fill="currentColor" fill-opacity=".14"/><circle cx="12" cy="${HALO_Y}" r="${HEAD_R}"/><path d="M4.5 22.6c0-4 3.4-6.6 7.5-6.6s7.5 2.6 7.5 6.6"/></g>`} />;
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
