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
  const goldWide = `url(#gold-wide-${id})`;
  return (
    <svg className={className} width={size} height={size * 1.4} viewBox="0 -8 120 168" aria-hidden="true">
      <defs>
        {/* Մեկ ընդհանուր փայլ ամբողջ սկիհի համար (սկիհի կոորդինատներով), որ բոլոր մասերում նույն գծով լինի */}
                <linearGradient id={`gold-${id}`} gradientUnits="userSpaceOnUse" x1="208.5" x2="282" y1="0" y2="0">
          <stop offset="0" stopColor="#7a4a12" /><stop offset=".22" stopColor="#d9a84a" /><stop offset=".39" stopColor="#dcac4c" /><stop offset=".45" stopColor="#fff4cc" /><stop offset=".5" stopColor="#e2b656" /><stop offset=".6" stopColor="#d6a647" /><stop offset="1" stopColor="#6e420f" />
        </linearGradient>
        {/* Գավաթի և հիմքի համար՝ նույն գծով, բայց ավելի լայն փայլ */}
        <linearGradient id={`gold-wide-${id}`} gradientUnits="userSpaceOnUse" x1="208.5" x2="282" y1="0" y2="0">
          <stop offset="0" stopColor="#7a4a12" /><stop offset=".22" stopColor="#d9a84a" /><stop offset=".33" stopColor="#e3b75a" /><stop offset=".45" stopColor="#fff4cc" /><stop offset=".56" stopColor="#e6bd60" /><stop offset=".66" stopColor="#d6a647" /><stop offset="1" stopColor="#6e420f" />
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
      {/* Սկիհը՝ սեփականատիրոջ ձևով (կոորդինատները տեղափոխված են ընդհանուր տարածք) */}
      <g transform="translate(-181.652 -37.805)">
        {/* Վերին կցորդը գավաթից առաջ է նկարվում, որ նրա ծայրը թաքնվի գավաթի տակ */}
        <path d="M231.326 119.222h20.652l-6.502 18.438h-8z" fill={gold} stroke={dark} strokeWidth=".6" />
        <path d="M211.652 67.805h60l-6 44c-2 10-12 16-24 16s-22-6-24-16z" fill={goldWide} stroke={dark} strokeWidth="1" />
        <path d="M214.448 86.805h54M216.448 108.805h50" stroke={dark} strokeOpacity=".4" />
        <path d="M229.582 143.152c0-8 24-8 24 0s-24 8-24 0z" fill={gold} stroke={dark} strokeWidth=".6" />
        {/* Ստորին կցորդը հիմքից առաջ է նկարվում, որ նրա ծայրը թաքնվի հիմքի տակ */}
        <path d="M237.652 148.798h8l4.6 23.2h-17.2z" fill={gold} stroke={dark} strokeWidth=".6" />
        <path d="M208.536 187.835l8-18h52l8 18z" fill={goldWide} stroke={dark} strokeWidth="1" />
      </g>
    </svg>
  );
}
