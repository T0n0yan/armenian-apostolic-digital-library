import { bounds, computeHotspots, polygonOf, type ChurchModel } from "./model";

const pts = (outline: Parameters<typeof polygonOf>[0]) => polygonOf(outline).map(([x, z]) => `${x.toFixed(2)},${z.toFixed(2)}`).join(" ");

/** Հատակագիծ (վերևից)՝ նույն անձնագրից, ինչ 3D-ն։ Աշխատում է նաև առանց WebGL-ի։ Արևելքը վերևում է։ */
export function ChurchPlan({ model, selected, onPick }: { model: ChurchModel; selected: string | null; onPick: (id: string) => void }) {
  const box = bounds(model.rooms.flatMap((room) => polygonOf(room.outline)));
  const pad = 2;
  const spots = computeHotspots(model).filter((spot) => spot.view === "inside" && spot.kind !== "gmbet" && spot.kind !== "jah");
  const viewBox = `${box.minX - pad} ${box.minZ - pad - 1.2} ${box.maxX - box.minX + pad * 2} ${box.maxZ - box.minZ + pad * 2 + 1.2}`;
  return (
    <svg className="h-full w-full" viewBox={viewBox} role="img" aria-label="Եկեղեցու հատակագիծը">
      <text x={(box.minX + box.maxX) / 2} y={box.minZ - pad + 0.2} textAnchor="middle" className="fill-gold" fontSize="0.8" fontWeight="700">Արևելք ↑</text>
      {model.rooms.map((room) => (
        <polygon key={room.id} points={pts(room.outline)} fill="rgb(217 181 111 / 10%)" stroke="rgb(217 181 111 / 70%)" strokeWidth="0.12" strokeLinejoin="round" />
      ))}
      {model.bema ? <polygon points={pts(model.bema.outline)} fill="rgb(217 181 111 / 16%)" stroke="rgb(217 181 111 / 80%)" strokeWidth="0.1" /> : null}
      {model.balconies.map((balcony, i) => (
        <polygon key={i} points={pts(balcony.outline)} fill="none" stroke="rgb(217 181 111 / 60%)" strokeWidth="0.08" strokeDasharray="0.3 0.2" />
      ))}
      {model.arcades.map((arcade, i) => (
        <line key={i} x1={arcade.from[0]} y1={arcade.from[1]} x2={arcade.to[0]} y2={arcade.to[1]} stroke="rgb(217 181 111 / 45%)" strokeWidth="0.08" strokeDasharray="0.8 1.2" />
      ))}
      {model.dome ? <circle cx={model.dome.at[0]} cy={model.dome.at[1]} r={model.dome.radius} fill="none" stroke="rgb(217 181 111 / 45%)" strokeWidth="0.08" strokeDasharray="0.3 0.25" /> : null}
      {spots.map((spot) => {
        const on = spot.id === selected;
        return (
          <g key={spot.id} className="cursor-pointer outline-none [&:focus-visible>circle:nth-child(2)]:stroke-[var(--gold-bright)]" role="button" tabIndex={0} aria-label={spot.name} aria-pressed={on}
            onClick={() => onPick(spot.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPick(spot.id); } }}>
            <circle cx={spot.at[0]} cy={spot.at[2]} r="0.9" fill="transparent" />
            <circle cx={spot.at[0]} cy={spot.at[2]} r={on ? 0.42 : 0.3} className={on ? "fill-gold-bright" : "fill-gold"} stroke="var(--page-bg)" strokeWidth="0.1" />
            {on ? <text x={spot.at[0]} y={spot.at[2] - 0.7} textAnchor="middle" className="fill-ink" fontSize="0.75" fontWeight="700">{spot.name}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}
