import { useId } from "react";

/**
 * Ոսկե սկիհը Հաղորդության հացով (նշխար՝ քանդակված հայկական խաչով), կիրակնօրյա պատուհանի և
 * կիսվելու նկարների համար։ dark՝ եզրագծի գույնը (ցերեկային ռեժիմում ավելի մուգ, որ երևա)։
 */
export function ChaliceArt({ size = 200, dark = "#4a2a08", className = "" }: { size?: number; dark?: string; className?: string }) {
  const id = useId().replace(/:/gu, "");
  // Խաչը. կրկնակի եզրագծով թևեր, ծայրերին եռաթերթ զարդ։
  const cx = 60, cy = 20, L = 13, W = 3.2;
  const trefoil = (x: number, y: number, r: number) => (
    <g transform={`translate(${x} ${y}) rotate(${r})`}><circle cx="0" cy="-3" r="2.3" /><circle cx="-2.8" cy="-.6" r="2" /><circle cx="2.8" cy="-.6" r="2" /></g>
  );
  const cross = (
    <>
      <path d={`M${cx - W} ${cy - L}h${2 * W}v${L - W}h${L - W}v${2 * W}h-${L - W}v${L - W}h-${2 * W}v-${L - W}h-${L - W}v-${2 * W}h${L - W}z`} />
      {trefoil(cx, cy - L, 0)}{trefoil(cx + L, cy, 90)}{trefoil(cx, cy + L, 180)}{trefoil(cx - L, cy, 270)}
    </>
  );
  const gold = `url(#gold-${id})`;
  return (
    <svg className={className} width={size} height={size * 1.4} viewBox="0 -8 120 168" aria-hidden="true">
      <defs>
        <linearGradient id={`gold-${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#7a4a12" /><stop offset=".22" stopColor="#d9a84a" /><stop offset=".45" stopColor="#fff4cc" /><stop offset=".6" stopColor="#e9c46a" /><stop offset="1" stopColor="#6e420f" />
        </linearGradient>
        <radialGradient id={`host-${id}`} cx=".45" cy=".35" r=".65">
          <stop offset="0" stopColor="#fffaf0" /><stop offset=".7" stopColor="#f1e4c6" /><stop offset="1" stopColor="#d9c49a" />
        </radialGradient>
      </defs>
      {/* Նշխարը՝ սկիհի մեջ, կիսով չափ երևացող */}
      <circle cx="60" cy="24" r="28" fill={`url(#host-${id})`} stroke="#c8ae7c" strokeWidth="1" />
      <circle cx="60" cy="24" r="25.5" fill="none" stroke="#cdb487" strokeWidth="2" strokeDasharray="1.4 1.1" />
      <g fill="#b99d68" transform="translate(.7 .7)" opacity=".75">{cross}</g>
      <g fill="#fbf4e2" stroke="#d8c08f" strokeWidth=".5">{cross}</g>
      <path d={`M${cx} ${cy - L + 1.5}V${cy + L - 1.5}M${cx - L + 1.5} ${cy}H${cx + L - 1.5}`} stroke="#c9b07e" strokeWidth=".9" fill="none" />
      {/* Սկիհը */}
      <path d="M30 30h60l-6 44c-2 10-12 16-24 16s-22-6-24-16z" fill={gold} stroke={dark} strokeWidth="1" />
      <path d="M30 30h60" stroke="#fff6d8" strokeWidth="2.5" />
      <path d="M33 44h54M35 66h50" stroke={dark} strokeOpacity=".4" />
      <path d="M52 90h16l-4 6h-8z" fill={gold} />
      <path d="M48 104c0-8 24-8 24 0s-24 8-24 0z" fill={gold} stroke={dark} strokeWidth=".8" />
      <path d="M56 110h8l4 20h-16z" fill={gold} />
      <path d="M26 150l8-18h52l8 18z" fill={gold} stroke={dark} strokeWidth="1" />
      <path d="M34 132h52" stroke="#fff6d8" strokeOpacity=".7" />
      <path d="M26 150h68v5H26z" fill={dark} opacity=".8" />
    </svg>
  );
}
