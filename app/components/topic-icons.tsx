import { useEffect, useRef, useState, type SVGProps } from "react";

/**
 * Topic icons in one 1.5px stroke style: IconOven (MIT) for the Gospel and questions, and our own drawings
 * for the praying hands, the lyre, the saint and the calendar (the Gospel's lines are ours too). Each
 * draws itself in when it appears, then moves slowly in a way that says what the topic is. The
 * motions live in app.css (.ti-*) and stop when animations are turned off.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, "strokeWidth"> & { size?: number; strokeWidth?: number | string };

function Icon({ size = 24, motion, body, strokeWidth: _strokeWidth, className = "", ...props }: IconProps & { motion: string; body: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={`ti ${motion} ${className}`} {...props}
      // Every stroke gets pathLength=1 so the draw-in animation works the same for all shapes.
      dangerouslySetInnerHTML={{ __html: body.replace(/<(path|circle|ellipse) /gu, '<$1 pathLength="1" class="ti-stroke" ') }} />
  );
}

/** Sacred places: a map pin with a small church inside; it lands, bounces once and settles, now and then. */
export function PlacesIcon(props: IconProps) {
  return <Icon {...props} motion="ti-pin" body={"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><path d=\"M12 21.5c-4-4.2-6.75-7.6-6.75-11a6.75 6.75 0 0 1 13.5 0c0 3.4-2.75 6.8-6.75 11z\"/><path d=\"M9.25 13.25v-2.6L12 8.75l2.75 1.9v2.6z\"/><path d=\"M12 5.25v2.5M10.9 6.2h2.2\"/></g>"} />;
}

/** Gospel teaching: the open Gospel, its lines following the curve of the pages, with a cross. */
export function GospelIcon(props: IconProps) {
  return <Icon {...props} motion="ti-gospel" body={"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><path d=\"M12 7C9.75 5.25 6.5 4.5 2.75 4.75v13.5c3.75-.25 7 .5 9.25 2.25c2.25-1.75 5.5-2.5 9.25-2.25V4.75c-3.75-.25-7 .5-9.25 2.25m0 0v13\"/><path d=\"M5.2 8.7c1.4 0 2.8.35 4.1 1M5.2 11.7c1.4 0 2.8.35 4.1 1M5.2 14.7c.9 0 1.8.15 2.7.45\"/><path d=\"M16.75 8.5v7.2M14.75 10.9c1.3-.35 2.7-.45 4-.3\"/></g>"} />;
}

/**
 * Prayers: two hands joined in prayer, a cross hanging from a cord at the wrists. When the icon
 * appears the open hands come together once (SMIL, started from an effect so it also runs after a
 * client-side navigation); the cord follows the wrists. Drawn on a 256 grid.
 */
export function PrayerIcon({ size = 24, strokeWidth: _strokeWidth, className = "", ...props }: IconProps) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ref.current?.querySelectorAll<SVGAnimationElement>("animate, animateTransform").forEach((animation) => animation.beginElement?.());
  }, []);
  const motion = { begin: "indefinite", dur: "1.15s", fill: "freeze", calcMode: "spline", keyTimes: "0;1", keySplines: ".45 .05 .35 1" } as const;
  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 256 256" aria-hidden="true" className={`ti ti-pray ${className}`} {...props}>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={12}>
        <g>
          <animateTransform attributeName="transform" type="translate" values="-4 0;0 0" {...motion} />
          <animateTransform attributeName="transform" type="rotate" values="-18 79 157;0 79 157" additive="sum" {...motion} />
          <path d="M62 172 L79 157 C90 146 92 137 87 124 C80 107 82 98 90 82 C100 61 108 39 113 25 C115 18 125 18 128 26 L128 139 C127 153 117 165 105 176" />
          <path d="M110 112 C109 98 111 85 117 78 C121 74 125 74 128 76" />
        </g>
        <g>
          <animateTransform attributeName="transform" type="translate" values="4 0;0 0" {...motion} />
          <animateTransform attributeName="transform" type="rotate" values="18 177 157;0 177 157" additive="sum" {...motion} />
          <path d="M194 172 L177 157 C166 146 164 137 169 124 C176 107 174 98 166 82 C156 61 148 39 143 25 C141 18 131 18 128 26 L128 139 C129 153 139 165 151 176" />
          <path d="M146 112 C147 98 145 85 139 78 C135 74 131 74 128 76" />
        </g>
        <path strokeWidth={8} d="M79 157 C94 176 108 190 128 190 C148 190 162 176 177 157">
          <animate attributeName="d" values="M75 157 C90 176 108 190 128 190 C148 190 166 176 181 157;M79 157 C94 176 108 190 128 190 C148 190 162 176 177 157" {...motion} />
        </path>
        <path strokeWidth={4} d="M128 192 L128 201" />
        <path strokeWidth={9} d="M128 205 L128 232 M115 215 L141 215" />
        <g fill="currentColor" stroke="none"><circle cx="128" cy="205" r="6" /><circle cx="115" cy="215" r="6" /><circle cx="141" cy="215" r="6" /><circle cx="128" cy="232" r="6" /></g>
      </g>
    </svg>
  );
}

/** Psalms: David's lyre, its strings trembling. */
export function PsalmIcon(props: IconProps) {
  return <Icon {...props} motion="ti-harp" body={"<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><path d=\"M9 19.5C6.2 18 4.8 14.6 5.5 11.4c.5-2.3 2-3.2 1.5-5.8c-.2-1-1-1.6-2-1.3M15 19.5c2.8-1.5 4.2-4.9 3.5-8.1c-.5-2.3-2-3.2-1.5-5.8c.2-1 1-1.6 2-1.3\"/><path d=\"M6.6 7.4h10.8M8.5 19.5h7\"/><path d=\"M10 7.4v12.1M12 7.4v12.1M14 7.4v12.1\"/></g>"} />;
}

/**
 * Lives of the saints: a saint holding the Gospel. The halo draws itself from the left shoulder
 * over the head to the right shoulder when the icon appears (the path runs that way). 256 grid.
 */
export function SaintIcon({ size = 24, strokeWidth: _strokeWidth, className = "", ...props }: IconProps) {
  const stroke = { pathLength: 1, className: "ti-stroke" };
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden="true" className={`ti ti-halo ${className}`} {...props}>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={12}>
        <path {...stroke} d="M108 112 C82 102 69 82 71 61 C74 31 99 14 128 14 C157 14 182 31 185 61 C187 82 174 102 148 112" />
        <path {...stroke} d="M108 112 L108 94 C96 83 91 68 98 54 C104 41 116 37 128 37 C140 37 152 41 158 54 C165 68 160 83 148 94 L148 112 C142 124 136 131 128 131 C120 131 114 124 108 112Z" />
        <path {...stroke} d="M108 112 C96 116 86 121 77 132 C63 150 53 179 49 207 C65 191 81 183 99 181" />
        <path {...stroke} d="M148 112 C160 116 170 121 179 132 C193 150 203 179 207 207 C191 191 175 183 157 181" />
        <path {...stroke} d="M77 132 L91 181 M179 132 L165 181" />
        <path {...stroke} d="M82 187 C78 207 71 228 59 241 L96 241 L96 204" />
        <path {...stroke} d="M174 187 C178 207 185 228 197 241 L160 241 L160 204" />
        <path {...stroke} d="M101 180 L101 146 Q101 142 106 142 L150 142 Q155 142 155 146 L155 180 M104 205 L152 205" />
        <path {...stroke} strokeWidth={5} d="M109 149 L109 177" />
        <path {...stroke} strokeWidth={8} d="M132 157 L132 185 M120 169 L144 169" />
        <g fill="currentColor" stroke="none"><circle cx="132" cy="157" r="5" /><circle cx="132" cy="185" r="5" /><circle cx="120" cy="169" r="5" /><circle cx="144" cy="169" r="5" /></g>
        <path {...stroke} d="M82 187 C91 181 100 177 106 181 C115 187 108 198 96 204" />
        <path {...stroke} d="M174 187 C165 181 156 177 150 181 C141 187 148 198 160 204" />
      </g>
    </svg>
  );
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
