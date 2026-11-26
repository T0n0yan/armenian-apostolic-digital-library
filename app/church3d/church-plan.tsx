import { ROOMS, BEMA_FRONT } from "./plan";
import type { ChurchPart } from "./parts";

/** Հատակագիծ (վերևից)՝ նույն թվերից, ինչ 3D-ն։ Աշխատում է նաև առանց WebGL-ի։ Արևելքը վերևում է։ */
export function ChurchPlan({ parts, selected, onPick }: { parts: readonly ChurchPart[]; selected: string | null; onPick: (id: string) => void }) {
  const inside = parts.filter((part) => part.view === "inside" && part.id !== "gmbet" && part.id !== "jah");
  return (
    <svg className="h-full w-full" viewBox="-9.5 -11 19 30" role="img" aria-label="Եկեղեցու հատակագիծը">
      <text x="0" y="-9.6" textAnchor="middle" className="fill-gold" fontSize="0.8" fontWeight="700">Արևելք ↑</text>
      {ROOMS.map((room) => (
        <polygon key={room.id} points={room.points.map(([x, z]) => `${x},${z}`).join(" ")}
          fill="rgb(217 181 111 / 10%)" stroke="rgb(217 181 111 / 70%)" strokeWidth="0.12" strokeLinejoin="round" />
      ))}
      <circle cx="0" cy="0" r="3.6" fill="none" stroke="rgb(217 181 111 / 45%)" strokeWidth="0.08" strokeDasharray="0.3 0.25" />
      <line x1="-4" x2="4" y1={BEMA_FRONT} y2={BEMA_FRONT} stroke="rgb(217 181 111 / 80%)" strokeWidth="0.16" />
      {inside.map((part) => {
        const on = part.id === selected;
        return (
          <g key={part.id} className="cursor-pointer" role="button" tabIndex={0} aria-label={part.name} aria-pressed={on}
            onClick={() => onPick(part.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPick(part.id); } }}>
            <circle cx={part.at[0]} cy={part.at[2]} r="0.9" fill="transparent" />
            <circle cx={part.at[0]} cy={part.at[2]} r={on ? 0.42 : 0.3} className={on ? "fill-gold-bright" : "fill-gold"} stroke="var(--page-bg)" strokeWidth="0.1" />
            {on ? <text x={part.at[0]} y={part.at[2] - 0.7} textAnchor="middle" className="fill-ink" fontSize="0.75" fontWeight="700">{part.name}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}
