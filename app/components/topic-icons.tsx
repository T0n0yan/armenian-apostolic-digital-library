import type { SVGProps } from "react";

/**
 * Topic icons from IconOven (MIT, https://iconoven.com), one stroke style for every topic. Each
 * draws itself in when it appears, then moves slowly in a way that says what the topic is. The
 * motions live in app.css (.ti-*) and stop when animations are turned off.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, "strokeWidth"> & { size?: number; strokeWidth?: number | string };

function Icon({ size = 24, motion, body, strokeWidth: _strokeWidth, className = "", ...props }: IconProps & { motion: string; body: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={`ti ${motion} ${className}`} {...props}
      // Every stroke gets pathLength=1 so the draw-in animation works the same for all shapes.
      dangerouslySetInnerHTML={{ __html: body.replaceAll("<path ", '<path pathLength="1" class="ti-stroke" ') }} />
  );
}

/** Gospel teaching: the open Gospel with a cross; its pages stir. */
export function GospelIcon(props: IconProps) {
  return <Icon {...props} motion="ti-gospel" body={"<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"M12 7C9.75 5.25 6.5 4.5 2.75 4.75v13.5c3.75-.25 7 .5 9.25 2.25c2.25-1.75 5.5-2.5 9.25-2.25V4.75c-3.75-.25-7 .5-9.25 2.25m0 0v13M5.25 9.5H9m-3.75 3H9m-3.75 3h2.5m8.75-7V16m-2-5.25h4\"/>"} />;
}

/** Prayers: hands joined in prayer, softly glowing. */
export function PrayerIcon(props: IconProps) {
  return <Icon {...props} motion="ti-pray" body={"<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"M10.5 18V4.75a1.75 1.75 0 0 0-3.5 0v5.5c-1.5 1-2.25 2.5-2.25 4.25c0 1.5.5 2.75 1.5 3.5Zm3 0V4.75a1.75 1.75 0 0 1 3.5 0v5.5c1.5 1 2.25 2.5 2.25 4.25c0 1.5-.5 2.75-1.5 3.5Zm-7.25 3h11.5\"/>"} />;
}

/** Psalms: David's harp, its strings trembling. */
export function PsalmIcon(props: IconProps) {
  return <Icon {...props} motion="ti-harp" body={"<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"M5.75 3.75v17h3m-3-17c2.5 0 4 3 7.5 3c2.5 0 4-1.5 5.75-1.5m-9.75.65v12.5M12.5 7.35V14m3.25-6.9v2.5M19 5.25L7.5 20.75\"/>"} />;
}

/** Lives of the saints: a face beneath a halo that floats and shines. */
export function SaintIcon(props: IconProps) {
  return <Icon {...props} motion="ti-halo" body={"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><circle cx=\"12\" cy=\"14.75\" r=\"6.5\"/><path d=\"M8.5 13c.6-.6 1.65-.6 2.25 0m2.5 0c.6-.6 1.65-.6 2.25 0m-6 3.5c1.4 1 3.6 1 5 0M12 2.75c3 0 5.5.6 5.5 1.38S15 5.5 12 5.5s-5.5-.6-5.5-1.37S9 2.75 12 2.75\"/></g>"} />;
}

/** Daily readings: the calendar page turns over. */
export function CalendarIcon(props: IconProps) {
  return <Icon {...props} motion="ti-calendar" body={"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><rect width=\"16.5\" height=\"15\" x=\"3.75\" y=\"5.25\" rx=\"2.5\"/><path d=\"M3.75 10h16.5M8 2.75v4.5m8-4.5v4.5\"/><rect width=\"5.5\" height=\"5\" x=\"9.25\" y=\"12.75\" rx=\"1.25\"/></g>"} />;
}

/** Questions from the Bible: a question that tilts as if wondering. */
export function QuestionIcon(props: IconProps) {
  return <Icon {...props} motion="ti-question" body={"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path stroke-width=\"1.5\" d=\"M12 3.25c4.85 0 8.75 3.5 8.75 7.85s-3.9 7.85-8.75 7.85c-1.1 0-2.15-.18-3.1-.5L4.6 20c-.6.2-1.15-.4-.9-.95l1.2-2.9c-1-1.4-1.65-3.15-1.65-5.05c0-4.35 3.9-7.85 8.75-7.85\"/><path stroke-width=\"1.5\" d=\"M9.75 9.1a2.25 2.25 0 1 1 3.1 2.08c-.5.2-.85.66-.85 1.2v.37\"/><path stroke-width=\"2\" d=\"M12 15.25h.01\"/></g>"} />;
}

/** Any other topic: a cross. */
export function CrossIcon(props: IconProps) {
  return <Icon {...props} motion="ti-cross" body={"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><path d=\"M10.75 2.75h2.5q.75 0 .75.75v1.25q0 .75.75.75h3.5q.75 0 .75.75v2.5q0 .75-.75.75h-3.5q-.75 0-.75.75v4.25q0 .75-.75.75h-2.5q-.75 0-.75-.75v-4.25q0-.75-.75-.75h-3.5Q5 9.5 5 8.75v-2.5q0-.75.75-.75h3.5q.75 0 .75-.75V3.5q0-.75.75-.75\"/><rect width=\"11\" height=\"3\" x=\"6.5\" y=\"18.25\" rx=\"1\"/></g>"} />;
}
