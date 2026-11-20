import { DoorOpen, Flame, Gift, HandHeart, Home, Music, ShieldQuestion, Sparkles, Wine, type LucideIcon } from "lucide-react";
import { RULE_KINDS, type RuleKind } from "../data/etiquette";

/** Կանոն / Ավանդույթ / Սնահավատություն պիտակը։ */
export function KindBadge({ kind }: { kind: RuleKind }) {
  return <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${RULE_KINDS[kind].className}`}>{RULE_KINDS[kind].label}</span>;
}

/** Ամեն բաժնի պատկերակը (ճանապարհի կանգառները)։ */
export const TOPIC_ICONS: Record<string, LucideIcon> = {
  entrance: DoorOpen,
  candles: Flame,
  liturgy: Music,
  holy: Sparkles,
  clergy: HandHeart,
  communion: Wine,
  offering: Gift,
  special: ShieldQuestion,
  home: Home,
};

export function TopicIcon({ slug, size = 22 }: { slug: string; size?: number }) {
  const Icon = TOPIC_ICONS[slug] ?? Sparkles;
  return <Icon aria-hidden="true" size={size} strokeWidth={1.7} />;
}

// Մոմերը ավազի մեջ՝ x, բարձրություն, ուշացում։
const CANDLES: Array<[number, number, number]> = [[146, 34, 0], [160, 44, 0.6], [174, 28, 1.1], [188, 50, 0.3], [202, 38, 1.5], [216, 46, 0.9], [230, 30, 0.2], [244, 40, 1.3], [258, 26, 0.7]];

/** Գլխանկար. գիշեր, հայկական եկեղեցի լուսավոր դռնով, առջևում մոմեր ավազի մեջ (բոցերը թրթռում են)։ */
export function ChurchScene({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 400 220" role="img" aria-label="Հայկական եկեղեցի գիշերով և վառվող մոմեր">
      <defs>
        <radialGradient id="etq-door" cx="50%" cy="80%" r="60%"><stop offset="0" stopColor="#ffd98a" /><stop offset="1" stopColor="#c8862f" /></radialGradient>
        <radialGradient id="etq-halo" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#f6c56b" stopOpacity=".55" /><stop offset="1" stopColor="#f6c56b" stopOpacity="0" /></radialGradient>
        <linearGradient id="etq-flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#ff9d2e" /><stop offset=".6" stopColor="#ffd36b" /><stop offset="1" stopColor="#fff6d6" /></linearGradient>
      </defs>
      {/* աստղեր */}
      <g fill="#f3dca8" opacity=".7">
        <circle cx="40" cy="30" r="1.1" /><circle cx="78" cy="58" r=".8" /><circle cx="120" cy="22" r="1" /><circle cx="300" cy="26" r="1.2" /><circle cx="340" cy="62" r=".8" /><circle cx="362" cy="20" r="1" /><circle cx="262" cy="44" r=".7" />
      </g>
      {/* եկեղեցի՝ հայկական. գլանաձև թմբուկ, լայն կոնաձև գմբեթ, եռանկյուն ճակատներ */}
      <g stroke="#d9b56f" strokeWidth="1.4" strokeLinejoin="round" fill="rgb(40 22 48 / 92%)">
        <path d="M200 8v14M194.5 13.5h11" fill="none" strokeWidth="2" strokeLinecap="round" />
        <path d="M200 24 166 52h68z" />
        <path d="M174 52h52v30h-52z" />
        <path d="M110 150V100l44-20h92l44 20v50z" />
        <path d="M150 80 200 58l50 22" fill="none" />
        <path d="M110 100h180" fill="none" opacity=".55" />
      </g>
      <g stroke="#d9b56f" strokeWidth="1" fill="none" opacity=".7">
        <path d="M182 82V62M192 82V62M208 82V62M218 82V62" />
      </g>
      {/* պատուհաններ */}
      <g fill="#f0c56e" opacity=".85">
        <path d="M196.5 66a3.5 3.5 0 0 1 7 0v12h-7z" /><path d="M136 110a4 4 0 0 1 8 0v18h-8z" /><path d="M256 110a4 4 0 0 1 8 0v18h-8z" />
      </g>
      {/* լուսավոր դուռ */}
      <circle className="etq-glow" cx="200" cy="132" r="46" fill="url(#etq-halo)" />
      <path d="M186 150v-26a14 14 0 0 1 28 0v26z" fill="url(#etq-door)" stroke="#d9b56f" strokeWidth="1.4" />
      <path d="M200 116v10M196 120h8" stroke="#7a4a12" strokeWidth="1.4" strokeLinecap="round" />
      {/* գետին՝ բարակ գիծ */}
      <path d="M60 150h280" stroke="#d9b56f" strokeWidth="1" opacity=".45" />
      {/* մոմակալ՝ ավազ */}
      <path d="M130 200h140l-10 14H140z" fill="#8a5a1f" stroke="#d9b56f" strokeWidth="1" />
      <path d="M128 196h144v6H128z" fill="#e6c48a" />
      <circle className="etq-glow" cx="202" cy="168" r="70" fill="url(#etq-halo)" opacity=".6" />
      {CANDLES.map(([x, h, delay]) => (
        <g key={x}>
          <rect x={x - 1.6} y={196 - h} width="3.2" height={h} rx="1" fill="#f3e2b5" />
          <ellipse className="etq-flame" style={{ animationDelay: `${delay}s` }} cx={x} cy={196 - h - 6} rx="3" ry="7" fill="url(#etq-flame)" />
        </g>
      ))}
    </svg>
  );
}
