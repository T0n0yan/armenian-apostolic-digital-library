// Ադմինի խմբագրիչ՝ եկեղեցու անձնագիրը փոխելու համար։ Հատակագծում (ներս/դուրս) քաշում ես կետերը, պարագաները,
// կամարների ծայրերը, գմբեթը, կողքին 3D-ն է, որտեղ պարագաները նույնպես սեղմվում և քաշվում են։
// Քաշելիս օգնական գծերը կպցնում են կետը մյուս կետերի ուղղությանը (ուղղահայաց/հորիզոնական պատեր), ցույց են տալիս չափերը։
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Copy, Crosshair, Eye, Hand, ImagePlus, Plus, Redo2, RotateCcw, RotateCw, Trash2, Undo2, X } from "lucide-react";
import { IconCrop } from "./icon-crop";
import { Corner, FullscreenButton, canvasButton, canvasPill, canvasSegment } from "./canvas-tools";
import { fieldControl, fieldLabel } from "../components/ui-styles";
import {
  bounds, edgesOf, itemAnchor, polygonOf, type Arcade, type ChurchModel, type Dome, type Item, type ItemType, type Mass, type Niche,
  type OpeningShape, type Pt, type TuffColor, type V3, type Vault, type Vertex,
} from "./model";
import { gptPrompt } from "./prompt";
import { BLOCK_TEMPLATES, TEMPLATES } from "./templates";
import { validateAnyModel } from "./blocks";
import type { ChurchScene, ViewMode } from "./scene";

export const ITEM_LABELS: Record<ItemType, string> = {
  altar: "Սուրբ Սեղան", lectern: "Գրակալ", font: "Մկրտության ավազան", "candle-table": "Մոմավառության սեղան", chandelier: "Ջահ",
  choir: "Դաս", icon: "Սրբապատկեր", bench: "Նստարան", column: "Սյուն", chalice: "Սկիհ", gospel: "Ավետարան", censer: "Բուրվառ",
  fan: "Քշոց", candlestick: "Աշտանակ", "procession-icon": "Թափորի սրբապատկեր",
  throne: "Կաթողիկոսական գահ", organ: "Երգեհոն", "descent-altar": "Իջման սեղան",
};
const TUFF_LABELS: Record<TuffColor, string> = { pink: "Վարդագույն", ochre: "Դեղնավուն", gray: "Մոխրագույն", black: "Սև" };
const SHAPE_LABELS: Record<OpeningShape, string> = { arch: "Կամարաձև", rect: "Ուղղանկյուն", round: "Կլոր", slit: "Նեղ", cross: "Խաչաձև" };

type End = 0 | 1;
type Selection =
  | { type: "item"; index: number }
  | { type: "room"; index: number; vertex: number | null }
  | { type: "mass"; index: number; vertex: number | null }
  | { type: "vault"; index: number; end: End | null }
  | { type: "arcade"; index: number; end: End | null }
  | { type: "dome" }
  | { type: "belfry" }
  | null;
type Target = NonNullable<Selection>;
type Layer = "inside" | "outside";
type Tab = "edit" | "json";
type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
type Draft = Mutable<ChurchModel>;

const snap = (v: number) => Math.round(v * 10) / 10;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const chip = (on: boolean) => `cursor-pointer rounded-full border px-3 py-1.5 text-[13px] font-semibold ${on ? "border-[rgb(217_181_111/60%)] bg-[rgb(217_181_111/18%)] text-gold-bright" : "border-edge bg-subtle text-ink"}`;
const small = "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-edge bg-subtle px-3 text-[13px] font-semibold text-ink disabled:cursor-default disabled:opacity-40";
const numField = `${fieldControl} !min-h-9 !px-2 !py-1 text-[13px]`;
const segment = (on: boolean) => `min-h-8 cursor-pointer rounded-control px-3 text-[12.5px] font-bold ${on ? "bg-[rgb(217_181_111/22%)] text-gold-bright" : "text-muted"}`;
/** Կպչելու հեռավորությունը (մ). ավելի մոտ՝ կպչում է, ավելի հեռու՝ ազատ է։ */
const SNAP = 0.35;

function Num({ label, value, onChange, step = 0.1 }: { label: string; value: number | undefined; onChange: (value: number | undefined) => void; step?: number }) {
  return (
    <label className="grid gap-1 text-[12px] font-semibold text-muted">{label}
      <input className={numField} type="number" inputMode="decimal" step={step} value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} />
    </label>
  );
}
function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-9 items-center gap-2 text-[13px]"><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /> {label}</label>;
}

/** Ի՞նչ փոխվեց երկու տարբերակի միջև (հայերեն, «Հետ/Առաջ»-ի հուշման համար)։ */
const PART_LABELS: Record<string, string> = {
  rooms: "սենյակներ", vaults: "կամարներ", arcades: "սյունաշարեր", masses: "դրսի ծավալներ", dome: "գմբեթ", domes: "գմբեթներ",
  belfry: "զանգակատուն", belfries: "զանգակատներ", bema: "բեմ", balconies: "պատշգամբ", tuff: "քարի գույն", look: "տեսք", name: "անուն",
};
function describeChange(a: ChurchModel, b: ChurchModel) {
  const items = a.items.length !== b.items.length ? Math.max(a.items.length, b.items.length) - 1
    : a.items.findIndex((item, i) => JSON.stringify(item) !== JSON.stringify(b.items[i]));
  if (items >= 0 && JSON.stringify(a.items) !== JSON.stringify(b.items)) {
    const item = b.items[items] ?? a.items[items];
    const what = a.items.length < b.items.length ? "ավելացված" : a.items.length > b.items.length ? "ջնջված" : "տեղը/չափը";
    return `${item ? ITEM_LABELS[item.type] : "պարագա"} (${what})`;
  }
  const keys = Object.keys(PART_LABELS).filter((key) => JSON.stringify((a as Record<string, unknown>)[key]) !== JSON.stringify((b as Record<string, unknown>)[key]));
  return keys.length ? keys.map((key) => PART_LABELS[key]).join(", ") : "փոփոխություն";
}

/**
 * 3D նախադիտում. տեսարանը նորից է կառուցվում փոփոխությունից 0,35 վրկ հետո, տեսախցիկը մնում է տեղում։
 * Ներսի տեսքում պարագաները սեղմվում (ընտրվում) և քաշվում են։
 */
function Preview({ model, mode, selected, editing, placing, api, onSelectItem, onMoveItem, onWallTap }: {
  model: ChurchModel; mode: ViewMode; selected: number | null; editing: boolean; placing: boolean; api: { current: ChurchScene | null };
  onSelectItem: (index: number | null) => void; onMoveItem: (index: number, at: Pt) => void;
  onWallTap: (spot: { at: Pt; y: number; rot: number }) => void;
}) {
  const placingRef = useRef(placing);
  placingRef.current = placing;
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ChurchScene | null>(null);
  const view = useRef<{ mode: ViewMode; eye: V3; look: V3 } | undefined>(undefined);
  const hooks = useRef({ onSelectItem, onMoveItem, onWallTap });
  const modeRef = useRef(mode);
  modeRef.current = mode;
  hooks.current = { onSelectItem, onMoveItem, onWallTap };
  const [shown, setShown] = useState(model);
  useEffect(() => {
    const timer = window.setTimeout(() => setShown(model), 350);
    return () => window.clearTimeout(timer);
  }, [model]);
  useEffect(() => {
    let cancelled = false;
    import("./scene").then(({ createChurchScene, webglAvailable }) => {
      if (cancelled || !host.current || !webglAvailable()) return;
      scene.current = createChurchScene(host.current, {
        model: shown, onPick: () => {}, view: view.current,
        edit: { onSelectItem: (i) => hooks.current.onSelectItem(i), onMoveItem: (i, at) => hooks.current.onMoveItem(i, at), onWallTap: (spot) => hooks.current.onWallTap(spot) },
      });
      scene.current.setPlacing(placingRef.current);
      scene.current.setMode(modeRef.current);
      scene.current.setEditing(editingRef.current);
      scene.current.highlight(selected);
      api.current = scene.current;
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (scene.current) view.current = scene.current.getView();
      scene.current?.dispose();
      scene.current = null;
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- տեսարանը կառուցվում է միայն մոդելը փոխվելիս
  }, [shown]);
  useEffect(() => { scene.current?.highlight(selected); }, [selected, shown]);
  useEffect(() => { scene.current?.setMode(mode); if (view.current) view.current = { ...view.current, mode }; }, [mode]);
  useEffect(() => { scene.current?.setEditing(editing); }, [editing]);
  useEffect(() => { scene.current?.setPlacing(placing); }, [placing]);
  return (
    <>
      <div ref={host} className="absolute inset-0" />
      <p className="pointer-events-none absolute right-0 bottom-14 left-0 m-0 text-center text-[11.5px] text-faint">
        {placing ? "" : mode !== "cutaway" ? "Դրսի տեսք" : editing ? "Պարագան սեղմեք՝ ընտրելու, քաշեք՝ տեղափոխելու" : "Դիտել. միայն պտտել և մոտեցնել"}
      </p>
    </>
  );
}

type Guide = { axis: "x" | "z"; value: number };
type Label = { at: Pt; text: string };

/** Հատակագիծ՝ քաշվող կետերով։ «Ներս» շերտ՝ սենյակներ, պարագաներ, կամարներ. «Դուրս»՝ ծավալներ, գմբեթ, զանգակատուն։ */
function PlanEditor({ model, layer, selection, guidesOn, onSelect, onDrag, onDragEnd }: {
  model: ChurchModel; layer: Layer; selection: Selection; guidesOn: boolean; onSelect: (selection: Selection) => void;
  onDrag: (target: Target, point: Pt) => void; onDragEnd: () => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ target: Target; anchors: Pt[] } | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const all = [...model.rooms.flatMap((room) => polygonOf(room.outline)), ...model.masses.flatMap((mass) => polygonOf(mass.outline))];
  const box = bounds(all);
  const live = `${box.minX - 4} ${box.minZ - 4} ${box.maxX - box.minX + 8} ${box.maxZ - box.minZ + 8}`;
  const frozen = useRef<string | null>(null);
  const viewBox = frozen.current ?? live;
  const same = (a: Selection, b: Target) => JSON.stringify(a) === JSON.stringify(b);

  const toPlan = (event: ReactPointerEvent): Pt => {
    const element = svg.current!;
    const point = element.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const p = point.matrixTransform(element.getScreenCTM()!.inverse());
    return [snap(p.x), snap(p.y)];
  };
  /** Կպչման կետեր՝ բոլոր անկյունները (բացի քաշվողից), պարագաների դեպքում՝ նաև մյուս պարագաները և առանցքը (x = 0)։ */
  const anchorsFor = (target: Target): Pt[] => {
    const points: Pt[] = [];
    model.rooms.forEach((room, i) => room.outline.forEach((v, j) => { if (!(target.type === "room" && target.index === i && target.vertex === j)) points.push([v[0], v[1]]); }));
    model.masses.forEach((mass, i) => mass.outline.forEach((v, j) => { if (!(target.type === "mass" && target.index === i && target.vertex === j)) points.push([v[0], v[1]]); }));
    if (target.type === "item") model.items.forEach((item, i) => { if (i !== target.index) points.push(item.at); });
    points.push([0, (box.minZ + box.maxZ) / 2]);
    return points;
  };
  const start = (target: Target) => (event: ReactPointerEvent) => {
    event.stopPropagation();
    onSelect(target);
    dragging.current = { target, anchors: anchorsFor(target) };
    frozen.current = live;
    svg.current?.setPointerCapture(event.pointerId);
  };
  function move(event: ReactPointerEvent) {
    const drag = dragging.current;
    if (!drag) return;
    let [x, z] = toPlan(event);
    const found: Guide[] = [];
    if (guidesOn) {
      const tol = drag.target.type === "item" ? SNAP * 0.6 : SNAP;
      const nearX = drag.anchors.reduce<number | null>((best, p) => (Math.abs(p[0] - x) < tol && (best === null || Math.abs(p[0] - x) < Math.abs(best - x)) ? p[0] : best), null);
      const nearZ = drag.anchors.reduce<number | null>((best, p) => (Math.abs(p[1] - z) < tol && (best === null || Math.abs(p[1] - z) < Math.abs(best - z)) ? p[1] : best), null);
      if (nearX !== null) { x = nearX; found.push({ axis: "x", value: nearX }); }
      if (nearZ !== null) { z = nearZ; found.push({ axis: "z", value: nearZ }); }
    }
    setGuides(found);
    // Կից պատերի երկարությունները (մ)։
    const t = drag.target;
    const outline = t.type === "room" && t.vertex !== null ? model.rooms[t.index].outline : t.type === "mass" && t.vertex !== null ? model.masses[t.index].outline : null;
    if (outline && (t.type === "room" || t.type === "mass") && t.vertex !== null) {
      const prev = outline[(t.vertex - 1 + outline.length) % outline.length];
      const next = outline[(t.vertex + 1) % outline.length];
      const label = (p: Vertex): Label => ({ at: [(p[0] + x) / 2, (p[1] + z) / 2], text: `${Math.hypot(p[0] - x, p[1] - z).toFixed(1)} մ` });
      setLabels([label(prev), label(next)]);
    } else setLabels([]);
    onDrag(t, [x, z]);
  }
  function end() {
    if (!dragging.current) return;
    dragging.current = null;
    frozen.current = null;
    setGuides([]);
    setLabels([]);
    onDragEnd();
  }
  const poly = (outline: readonly Vertex[]) => polygonOf(outline).map((p) => p.join(",")).join(" ");
  const handle = (key: string, p: Pt, target: Target, r = 0.3) => {
    const on = same(selection, target);
    return <circle key={key} cx={p[0]} cy={p[1]} r={on ? r + 0.12 : r} className="cursor-grab" fill={on ? "#e2c27e" : "var(--page-bg)"} stroke="#b07d2e" strokeWidth="0.1" onPointerDown={start(target)} />;
  };
  const vb = viewBox.split(" ").map(Number);

  return (
    <svg ref={svg} className="h-full w-full touch-none select-none" viewBox={viewBox} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerDown={() => onSelect(null)}>
      <text x={(box.minX + box.maxX) / 2} y={box.minZ - 2.6} textAnchor="middle" className="fill-gold" fontSize="0.8" fontWeight="700">Արևելք ↑</text>
      {model.masses.map((mass, i) => (
        <polygon key={`m${i}`} points={poly(mass.outline)} fill={layer === "outside" ? (selection?.type === "mass" && selection.index === i ? "rgb(217 181 111 / 24%)" : "rgb(217 181 111 / 10%)") : "none"}
          stroke={layer === "outside" ? "rgb(217 181 111 / 80%)" : "rgb(217 181 111 / 25%)"} strokeWidth={layer === "outside" ? 0.12 : 0.06} strokeDasharray={layer === "outside" ? undefined : "0.4 0.3"}
          className={layer === "outside" ? "cursor-pointer" : undefined} pointerEvents={layer === "outside" ? undefined : "none"}
          onPointerDown={layer === "outside" ? (event) => { event.stopPropagation(); onSelect({ type: "mass", index: i, vertex: null }); } : undefined} />
      ))}
      {model.rooms.map((room, i) => {
        const on = layer === "inside" && selection?.type === "room" && selection.index === i;
        return (
          <polygon key={room.id + i} points={poly(room.outline)} fill={layer === "inside" ? (on ? "rgb(217 181 111 / 22%)" : "rgb(217 181 111 / 9%)") : "none"}
            stroke={layer === "inside" ? "rgb(217 181 111 / 75%)" : "rgb(217 181 111 / 30%)"} strokeWidth={layer === "inside" ? 0.12 : 0.06}
            className={layer === "inside" ? "cursor-pointer" : undefined} pointerEvents={layer === "inside" ? undefined : "none"}
            onPointerDown={layer === "inside" ? (event) => { event.stopPropagation(); onSelect({ type: "room", index: i, vertex: null }); } : undefined} />
        );
      })}
      {model.bema ? <polygon points={poly(model.bema.outline)} fill="rgb(217 181 111 / 14%)" stroke="rgb(217 181 111 / 60%)" strokeWidth="0.08" pointerEvents="none" /> : null}
      {model.rooms.map((room) => (room.niches ?? []).map((niche, k) => {
        const edge = edgesOf(room.outline)[niche.edge];
        if (!edge) return null;
        const d = [edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]];
        const l = Math.hypot(d[0], d[1]) || 1;
        const c: Pt = [edge.a[0] + (d[0] / l) * niche.at, edge.a[1] + (d[1] / l) * niche.at];
        const n = edge.inward[0];
        return <line key={`${room.id}-n${k}`} x1={c[0] - (d[0] / l) * niche.w / 2 - n[0] * niche.depth / 2} y1={c[1] - (d[1] / l) * niche.w / 2 - n[1] * niche.depth / 2}
          x2={c[0] + (d[0] / l) * niche.w / 2 - n[0] * niche.depth / 2} y2={c[1] + (d[1] / l) * niche.w / 2 - n[1] * niche.depth / 2}
          stroke="rgb(217 181 111 / 70%)" strokeWidth={niche.depth} strokeOpacity="0.35" pointerEvents="none" />;
      }))}

      {layer === "inside" ? (
        <>
          {model.vaults.map((v, i) => (
            <g key={`va${i}`}>
              <line x1={v.from[0]} y1={v.from[1]} x2={v.to[0]} y2={v.to[1]} stroke="rgb(217 181 111 / 45%)" strokeWidth={v.width} strokeOpacity="0.12" pointerEvents="none" />
              <line x1={v.from[0]} y1={v.from[1]} x2={v.to[0]} y2={v.to[1]} stroke="#b07d2e" strokeWidth="0.08" strokeDasharray="0.5 0.3" className="cursor-pointer"
                onPointerDown={(event) => { event.stopPropagation(); onSelect({ type: "vault", index: i, end: null }); }} />
              {handle(`va${i}a`, v.from, { type: "vault", index: i, end: 0 }, 0.22)}
              {handle(`va${i}b`, v.to, { type: "vault", index: i, end: 1 }, 0.22)}
            </g>
          ))}
          {model.arcades.map((a, i) => (
            <g key={`ar${i}`}>
              <line x1={a.from[0]} y1={a.from[1]} x2={a.to[0]} y2={a.to[1]} stroke="#b07d2e" strokeWidth="0.14" className="cursor-pointer"
                onPointerDown={(event) => { event.stopPropagation(); onSelect({ type: "arcade", index: i, end: null }); }} />
              {Array.from({ length: a.count }, (_, k) => {
                const t = a.count > 1 ? k / (a.count - 1) : 0;
                return <rect key={k} x={a.from[0] + (a.to[0] - a.from[0]) * t - a.pillar / 2} y={a.from[1] + (a.to[1] - a.from[1]) * t - a.pillar / 2} width={a.pillar} height={a.pillar} fill="#b07d2e" pointerEvents="none" />;
              })}
              {handle(`ar${i}a`, a.from, { type: "arcade", index: i, end: 0 }, 0.22)}
              {handle(`ar${i}b`, a.to, { type: "arcade", index: i, end: 1 }, 0.22)}
            </g>
          ))}
          {model.rooms.map((room, i) => room.outline.map((v, j) => handle(`v${i}-${j}`, [v[0], v[1]], { type: "room", index: i, vertex: j })))}
          {model.items.map((item, i) => {
            const on = selection?.type === "item" && selection.index === i;
            const r = ((item.rot ?? 0) * Math.PI) / 180;
            return (
              <g key={`i${i}`} className="cursor-grab" onPointerDown={start({ type: "item", index: i })}>
                <circle cx={item.at[0]} cy={item.at[1]} r="0.7" fill="transparent" />
                <rect x={item.at[0] - 0.28} y={item.at[1] - 0.28} width="0.56" height="0.56" rx="0.1" fill={on ? "#e2c27e" : "#b07d2e"} stroke="var(--page-bg)" strokeWidth="0.08" />
                <line x1={item.at[0]} y1={item.at[1]} x2={item.at[0] + Math.sin(r) * 0.6} y2={item.at[1] + Math.cos(r) * 0.6} stroke={on ? "#e2c27e" : "#b07d2e"} strokeWidth="0.1" />
                {on ? <text x={item.at[0]} y={item.at[1] - 0.6} textAnchor="middle" className="fill-ink" fontSize="0.6" fontWeight="700">{item.name ?? ITEM_LABELS[item.type]}</text> : null}
              </g>
            );
          })}
        </>
      ) : (
        <>
          {model.masses.map((mass, i) => mass.outline.map((v, j) => handle(`mv${i}-${j}`, [v[0], v[1]], { type: "mass", index: i, vertex: j })))}
          {model.dome ? (
            <g>
              <circle cx={model.dome.at[0]} cy={model.dome.at[1]} r={model.dome.radius + 0.4} fill="rgb(217 181 111 / 12%)" stroke="#b07d2e" strokeWidth="0.08" pointerEvents="none" />
              {handle("dome", model.dome.at, { type: "dome" }, 0.4)}
            </g>
          ) : null}
          {model.belfry ? (
            <g>
              <circle cx={model.belfry.at[0]} cy={model.belfry.at[1]} r={model.belfry.radius + 0.35} fill="rgb(217 181 111 / 12%)" stroke="#b07d2e" strokeWidth="0.08" pointerEvents="none" />
              {handle("belfry", model.belfry.at, { type: "belfry" }, 0.35)}
            </g>
          ) : null}
        </>
      )}

      {guides.map((g, i) => g.axis === "x"
        ? <line key={`g${i}`} x1={g.value} x2={g.value} y1={vb[1]} y2={vb[1] + vb[3]} stroke="#e2c27e" strokeWidth="0.05" strokeDasharray="0.3 0.2" pointerEvents="none" />
        : <line key={`g${i}`} y1={g.value} y2={g.value} x1={vb[0]} x2={vb[0] + vb[2]} stroke="#e2c27e" strokeWidth="0.05" strokeDasharray="0.3 0.2" pointerEvents="none" />)}
      {labels.map((label, i) => (
        <text key={`l${i}`} x={label.at[0]} y={label.at[1]} textAnchor="middle" fontSize="0.55" fontWeight="700" className="fill-gold-bright" stroke="var(--page-bg)" strokeWidth="0.12" paintOrder="stroke" pointerEvents="none">{label.text}</text>
      ))}
    </svg>
  );
}

/** Ամենամոտ ուղիղ պատը կետին՝ սենյակը, պատի համարը, տեղը պատի վրա, ներս նայող նորմալը։ */
function nearestWall(model: ChurchModel, p: Pt) {
  let best: { room: number; edge: number; s: number; point: Pt; n: Pt; d: number } | null = null;
  model.rooms.forEach((room, r) => edgesOf(room.outline).forEach((edge) => {
    if (edge.bulge) return;
    const dx = edge.b[0] - edge.a[0];
    const dz = edge.b[1] - edge.a[1];
    const len = Math.hypot(dx, dz) || 1;
    const t = Math.max(0.5 / len, Math.min(1 - 0.5 / len, ((p[0] - edge.a[0]) * dx + (p[1] - edge.a[1]) * dz) / (len * len)));
    const q: Pt = [edge.a[0] + dx * t, edge.a[1] + dz * t];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (!best || d < best.d) best = { room: r, edge: edge.index, s: t * len, point: q, n: edge.inward[0], d };
  }));
  return best as { room: number; edge: number; s: number; point: Pt; n: Pt; d: number } | null;
}

export function ChurchEditor({ initial, placeId, placeName, saving, errors, onSave, onUploadIcon }: {
  initial: ChurchModel | null; placeId: string; placeName: string; saving: boolean; errors: string[]; onSave: (model: ChurchModel) => void;
  /** Սրբապատկերի նկարը վերբեռնել (WebP) և ստանալ կայքի հասցեն։ */
  onUploadIcon?: (file: Blob) => Promise<string | null>;
}) {
  const fresh = (): ChurchModel => ({ ...clone(TEMPLATES[0]), id: placeId, name: placeName, cameras: undefined });
  const [model, setModel] = useState<ChurchModel>(() => initial ?? fresh());
  const [past, setPast] = useState<ChurchModel[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [tab, setTab] = useState<Tab>("edit");
  const [layer, setLayer] = useState<Layer>("inside");
  const [mode, setMode] = useState<ViewMode>("cutaway");
  const [guidesOn, setGuidesOn] = useState(true);
  const [json, setJson] = useState("");
  const [jsonErrors, setJsonErrors] = useState<string[]>([]);
  const [copied, setCopied] = useState("");
  const [addType, setAddType] = useState<ItemType>("bench");
  const dragBase = useRef<ChurchModel | null>(null);
  const [future, setFuture] = useState<ChurchModel[]>([]);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState("");
  // «Սրբապատկեր նկարով»՝ վերբեռնված նկարը սպասում է, որ ադմինը 3D-ում սեղմի պատին։
  const [placing, setPlacing] = useState<{ url: string; aspect: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const iconFile = useRef<HTMLInputElement>(null);
  const [crop, setCrop] = useState<{ file: File; target: number | null } | null>(null);
  const cropTarget = useRef<number | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const sceneApi = useRef<ChurchScene | null>(null);
  const planCard = useRef<HTMLDivElement>(null);
  const previewCard = useRef<HTMLDivElement>(null);
  // Ստեղնաշարով՝ Ctrl/⌘+Z՝ հետ, Ctrl/⌘+Shift+Z կամ Ctrl+Y՝ առաջ (ոչ դաշտերում գրելիս)։
  const keys = useRef({ undo: () => {}, redo: () => {} });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!(event.ctrlKey || event.metaKey) || target?.closest("input, textarea, select")) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) { event.preventDefault(); keys.current.undo(); }
      else if ((key === "z" && event.shiftKey) || key === "y") { event.preventDefault(); keys.current.redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const dirty = useMemo(() => JSON.stringify(model) !== JSON.stringify(initial), [model, initial]);

  const commit = (next: ChurchModel) => {
    setPast((list) => [...list.slice(-39), model]);
    setFuture([]);
    setModel(next);
  };
  const edit = (change: (draft: Draft) => void) => {
    const draft = clone(model) as Draft;
    change(draft);
    commit(draft as ChurchModel);
  };
  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast((list) => list.slice(0, -1));
    setFuture((list) => [...list, model]);
    setModel(previous);
    setSelection(null);
    say(`Հետ՝ ${describeChange(model, previous)}`);
  };
  const redo = () => {
    const next = future.at(-1);
    if (!next) return;
    setFuture((list) => list.slice(0, -1));
    setPast((list) => [...list, model]);
    setModel(next);
    setSelection(null);
    say(`Առաջ՝ ${describeChange(model, next)}`);
  };
  const say = (text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3500);
  };
  /** Նկարը ընտրելուց հետո՝ կտրելու պատուհան (`target`՝ ում նկարն է փոխվում, `null`՝ նոր սրբապատկեր)։ */
  function pickIcon(file: File, target: number | null) {
    setCrop({ file, target });
  }
  /** Կտրված նկարը վերբեռնել. նորը սպասում է պատին սեղմելուն, եղածինը փոխվում է տեղում։ */
  async function cropped(image: Blob, aspect: number) {
    const target = crop?.target ?? null;
    setCrop(null);
    if (!onUploadIcon) return;
    setUploading(true);
    try {
      const url = await onUploadIcon(image);
      if (!url) { say("Նկարը չվերբեռնվեց, փորձեք նորից"); return; }
      if (target !== null && model.items[target]) {
        const h = model.items[target].h ?? 1.7;
        edit((m) => { Object.assign(m.items[target], { image: url, shape: "rect", w: Math.round(h * aspect * 100) / 100 }); });
        say("Նկարը փոխվեց");
        return;
      }
      setLayer("inside");
      setMode("cutaway");
      setPlacing({ url, aspect });
      previewCard.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    } finally {
      setUploading(false);
    }
  }
  /** Պատին սեղմելուց հետո՝ նոր սրբապատկեր այդ տեղում (կենտրոնը՝ սեղմման կետում, չափը՝ նկարի համամասնությամբ)։ */
  function hangIcon(spot: { at: Pt; y: number; rot: number }) {
    if (!placing) return;
    const h = placing.aspect > 1.2 ? 1.2 : 1.7;
    const w = Math.round(h * placing.aspect * 100) / 100;
    const y = Math.max(0.3, Math.round((spot.y - h / 2) * 100) / 100);
    edit((m) => { m.items.push({ type: "icon", at: [spot.at[0], spot.at[1]], y, rot: spot.rot, w, h, shape: "rect", image: placing.url }); });
    setSelection({ type: "item", index: model.items.length });
    setPlacing(null);
    say("Սրբապատկերը կախվեց. չափը և անունը՝ «Պարագաներ» բաժնում");
  }
  /** Տեսախցիկը՝ ընտրված պարագայի մոտ։ */
  const focusSelected = () => {
    if (selection?.type !== "item") { say("Նախ ընտրեք պարագա"); return; }
    const item = model.items[selection.index];
    if (!item) return;
    const { at, front } = itemAnchor(item);
    sceneApi.current?.focus([at[0] + front[0] * 4, at[1] + 1.6, at[2] + front[1] * 4], at);
  };

  keys.current = { undo, redo };

  function drag(target: Target, point: Pt) {
    if (!dragBase.current) dragBase.current = model;
    const p: [number, number] = [point[0], point[1]];
    setModel((current) => {
      const next = clone(current) as Draft;
      const vertex = (v: Mutable<Vertex>): Mutable<Vertex> => (v.length === 3 ? [p[0], p[1], v[2]] : [p[0], p[1]]);
      if (target.type === "item") next.items[target.index].at = p;
      if (target.type === "room" && target.vertex !== null) next.rooms[target.index].outline[target.vertex] = vertex(next.rooms[target.index].outline[target.vertex]);
      if (target.type === "mass" && target.vertex !== null) next.masses[target.index].outline[target.vertex] = vertex(next.masses[target.index].outline[target.vertex]);
      if (target.type === "vault" && target.end !== null) next.vaults[target.index][target.end ? "to" : "from"] = p;
      if (target.type === "arcade" && target.end !== null) next.arcades[target.index][target.end ? "to" : "from"] = p;
      if (target.type === "dome" && next.dome) next.dome.at = p;
      if (target.type === "belfry" && next.belfry) next.belfry.at = p;
      return next as ChurchModel;
    });
  }
  function dragEnd() {
    const base = dragBase.current;
    dragBase.current = null;
    if (base) setPast((list) => [...list.slice(-39), base]);
  }

  /** Ավազանը (կամ այլ պարագա) դնում է ամենամոտ պատի մեջ՝ փոսով (որմնախորշ), կամարով կամ առանց։ */
  function intoWall(index: number, arch: boolean) {
    const it = model.items[index];
    const wall = nearestWall(model, it.at);
    if (!wall) return;
    const depth = 0.9;
    edit((m) => {
      const room = m.rooms[wall.room];
      room.niches = [...(room.niches ?? []), { edge: wall.edge, at: snap(wall.s), w: 1.6, h: 2.6, depth, arch }];
      m.items[index].at = [snap(wall.point[0] - wall.n[0] * depth / 2), snap(wall.point[1] - wall.n[1] * depth / 2)];
      m.items[index].rot = Math.round((Math.atan2(wall.n[0], wall.n[1]) * 180) / Math.PI);
      m.items[index].niche = false;
    });
    setSelection({ type: "room", index: wall.room, vertex: null });
  }
  /** Պարագան դնում է պատի մոտ (առանց փոսի), դեմքով դեպի սենյակ։ */
  function toWall(index: number) {
    const wall = nearestWall(model, model.items[index].at);
    if (!wall) return;
    edit((m) => {
      m.items[index].at = [snap(wall.point[0] + wall.n[0] * 0.7), snap(wall.point[1] + wall.n[1] * 0.7)];
      m.items[index].rot = Math.round((Math.atan2(wall.n[0], wall.n[1]) * 180) / Math.PI);
    });
  }

  function applyJson() {
    try {
      const { shape: parsed, errors: problems } = validateAnyModel(JSON.parse(json));
      setJsonErrors(problems);
      if (parsed) { commit(parsed); setSelection(null); }
    } catch {
      setJsonErrors(["JSON-ը կարդալ չհաջողվեց. ստուգեք փակագծերն ու ստորակետերը"]);
    }
  }
  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); setCopied(what); window.setTimeout(() => setCopied(""), 2000); } catch { setCopied(""); }
  }

  const box = bounds(model.rooms.flatMap((r) => polygonOf(r.outline)));
  const center: [number, number] = [snap((box.minX + box.maxX) / 2), snap((box.minZ + box.maxZ) / 2)];
  const item = selection?.type === "item" ? model.items[selection.index] : null;
  const room = selection?.type === "room" ? model.rooms[selection.index] : null;
  const mass = selection?.type === "mass" ? model.masses[selection.index] : null;

  const panel = (title: string, children: ReactNode) => (
    <section className="paper-panel grid gap-3 px-4 py-4">
      <h3 className="m-0 text-[12px] font-bold tracking-[1.2px] text-gold uppercase">{title}</h3>
      {children}
    </section>
  );
  const historyButtons = (
    <>
      <button type="button" className={canvasButton} disabled={!past.length} aria-label="Հետ" title="Հետ (Ctrl+Z)" onClick={undo}><Undo2 aria-hidden="true" size={16} /></button>
      <button type="button" className={canvasButton} disabled={!future.length} aria-label="Առաջ" title="Առաջ (Ctrl+Shift+Z)" onClick={redo}><Redo2 aria-hidden="true" size={16} /></button>
    </>
  );
    const switchLayer = (next: Layer) => { setLayer(next); setMode(next === "outside" ? "outside" : "cutaway"); setSelection(null); };

  return (
    <div className="grid gap-4">
      {crop ? <IconCrop file={crop.file} onDone={(image, aspect) => void cropped(image, aspect)} onCancel={() => setCrop(null)} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={`${small} !border-[rgb(217_181_111/60%)] !bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] !text-[#2a1708]`} disabled={saving || !dirty} onClick={() => onSave(model)}>
          {saving ? "Պահվում է…" : dirty ? "Պահել սևագիրը" : "Պահված է"}
        </button>
        <Check label="Օգնական գծեր (կպչում)" value={guidesOn} onChange={setGuidesOn} />
        <span className="text-[12px] text-faint">Սևագիրը կայքում չի երևում, մինչև տերը չհրապարակի։</span>
      </div>
      {errors.length ? <ul className="m-0 grid gap-1 rounded-button border border-danger/40 bg-danger/5 px-4 py-3 text-[13px] text-danger">{errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}

      {panel("Սկսել ձևանմուշից", (
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((template) => (
            <button key={template.id} type="button" className={chip(false)} onClick={() => {
              if (window.confirm(`Փոխարինե՞լ ամբողջ մոդելը «${template.name}» ձևանմուշով։ («Հետ» կոճակով կարելի է վերադարձնել)`)) {
                commit({ ...clone(template), id: placeId, name: placeName, cameras: undefined });
                setSelection(null);
              }
            }}>{template.name}</button>
          ))}
        </div>
      ))}

      <div className="paper-card flex gap-1 p-1.5" role="tablist">
        {([["edit", "Խմբագրել"], ["json", "JSON / GPT"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); if (id === "json") { setJson(JSON.stringify(model, null, 2)); setJsonErrors([]); } }}
            className={`min-h-10 flex-1 cursor-pointer rounded-button px-2 text-[13.5px] font-bold ${tab === id ? "bg-[rgb(217_181_111/18%)] text-gold-bright shadow-[inset_0_0_0_1px_rgb(217_181_111/55%)]" : "text-muted"}`}>{label}</button>
        ))}
      </div>

      {tab === "json" ? (
        <section className="paper-panel grid gap-3 px-4 py-4">
          <p className="m-0 text-[13px] leading-[1.6] text-muted">
            GPT-ով. սեղմեք «Պատճենել GPT-ի հրահանգը», տվեք GPT-ին եկեղեցու նկարների (դրսից, ներսից, հատակագիծ) հետ, պատասխանը տեղադրեք այստեղ և սեղմեք «Կիրառել»։ Արդյունքը մոտավոր կլինի. ճշգրտեք «Խմբագրել» ներդիրում։
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={small} onClick={() => copy(gptPrompt(BLOCK_TEMPLATES[0], placeName), "prompt")}><Copy aria-hidden="true" size={15} /> {copied === "prompt" ? "Պատճենված է" : "Պատճենել GPT-ի հրահանգը"}</button>
            <button type="button" className={small} onClick={() => copy(JSON.stringify(model, null, 2), "json")}><Copy aria-hidden="true" size={15} /> {copied === "json" ? "Պատճենված է" : "Պատճենել JSON"}</button>
          </div>
          <textarea className={`${fieldControl} min-h-[320px] font-mono text-[12px] leading-[1.45]`} spellCheck={false} value={json} onChange={(event) => setJson(event.target.value)} />
          {jsonErrors.length ? <ul className="m-0 grid gap-1 text-[12.5px] text-danger">{jsonErrors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
          <button type="button" className={`${small} justify-self-start`} onClick={applyJson}>Կիրառել</button>
        </section>
      ) : (
        <>
          <div className="grid gap-4 min-[960px]:grid-cols-2">
            <div ref={planCard} className="paper-card relative h-[min(56svh,540px)] min-h-[320px] overflow-hidden">
              <div className="absolute inset-0 p-2"><PlanEditor model={model} layer={layer} selection={selection} guidesOn={guidesOn} onSelect={setSelection} onDrag={drag} onDragEnd={dragEnd} /></div>
              <Corner at="top-left">
                <div className={canvasPill}>
                  <button type="button" className={canvasSegment(layer === "inside")} onClick={() => switchLayer("inside")}>Ներս</button>
                  <button type="button" className={canvasSegment(layer === "outside")} onClick={() => switchLayer("outside")}>Դուրս</button>
                </div>
              </Corner>
              <Corner at="top-right">{historyButtons}<FullscreenButton target={planCard} /></Corner>
              <p className="pointer-events-none absolute right-0 bottom-1.5 left-0 m-0 text-center text-[11.5px] text-faint">
                {layer === "inside" ? "Քաշեք կետերը, պարագաները, կամարների ծայրերը" : "Քաշեք դրսի պատերի կետերը, գմբեթը, զանգակատունը"}
              </p>
            </div>
            <div ref={previewCard} className="paper-card relative h-[min(56svh,540px)] min-h-[320px] overflow-hidden">
              <Preview model={model} mode={mode} selected={selection?.type === "item" ? selection.index : null} editing={editing} placing={Boolean(placing)} api={sceneApi}
                onSelectItem={(index) => setSelection(index === null ? null : { type: "item", index })}
                onMoveItem={(index, at) => { edit((m) => { m.items[index].at = [at[0], at[1]]; }); setSelection({ type: "item", index }); }}
                onWallTap={hangIcon} />
              {placing ? (
                <div className="absolute top-14 left-1/2 z-[3] flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-full border border-edge bg-[var(--sheet-bg)] py-1 pr-1 pl-3 text-[12.5px] font-semibold text-gold-bright shadow-[0_2px_8px_rgb(0_0_0/30%)]" role="status">
                  Սեղմեք պատին, որտեղ կախված է պատկերը
                  <button type="button" className={canvasButton} aria-label="Չեղարկել" title="Չեղարկել" onClick={() => setPlacing(null)}><X aria-hidden="true" size={15} /></button>
                </div>
              ) : null}
              <Corner at="top-left">
                <div className={canvasPill} role="group" aria-label="Ռեժիմ">
                  <button type="button" className={canvasSegment(!editing)} aria-pressed={!editing} title="Միայն պտտել և մոտեցնել, ոչինչ չի շարժվում" onClick={() => setEditing(false)}><Eye aria-hidden="true" size={14} className="inline align-[-2px]" /> Դիտել</button>
                  <button type="button" className={canvasSegment(editing)} aria-pressed={editing} title="Սեղմել և քաշել պարագաները" onClick={() => setEditing(true)}><Hand aria-hidden="true" size={14} className="inline align-[-2px]" /> Խմբագրել</button>
                </div>
              </Corner>
              <Corner at="top-right">{historyButtons}</Corner>
              <Corner at="bottom-left">
                <div className={canvasPill}>
                  <button type="button" className={canvasSegment(mode === "cutaway")} onClick={() => setMode("cutaway")}>Ներսից</button>
                  <button type="button" className={canvasSegment(mode === "outside")} onClick={() => setMode("outside")}>Դրսից</button>
                </div>
              </Corner>
              <Corner at="bottom-right">
                <button type="button" className={canvasButton} aria-label="Մոտեցնել ընտրվածին" title="Մոտեցնել ընտրված պարագային" onClick={focusSelected}><Crosshair aria-hidden="true" size={16} /></button>
                <button type="button" className={canvasButton} aria-label="Սկզբնական տեսք" title="Սկզբնական տեսք" onClick={() => sceneApi.current?.reset()}><RotateCcw aria-hidden="true" size={16} /></button>
                <FullscreenButton target={previewCard} />
              </Corner>
              {toast ? <p className="pointer-events-none absolute top-14 left-1/2 z-[3] m-0 -translate-x-1/2 rounded-full border border-edge bg-[var(--sheet-bg)] px-3 py-1 text-[12.5px] font-semibold text-gold-bright shadow-[0_2px_8px_rgb(0_0_0/30%)]" role="status">{toast}</p> : null}
            </div>
          </div>

          <div className="grid gap-4 min-[960px]:grid-cols-2">
            {panel("Ընդհանուր", (
              <div className="grid gap-3 min-[560px]:grid-cols-2">
                <label className={fieldLabel}>Անունը<input className={fieldControl} value={model.name} onChange={(event) => edit((m) => { m.name = event.target.value; })} /></label>
                <label className={fieldLabel}>Քարի գույնը
                  <select className={fieldControl} value={model.tuff} onChange={(event) => edit((m) => { m.tuff = event.target.value as TuffColor; })}>
                    {Object.entries(TUFF_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>
            ))}

            {layer === "inside" ? panel("Պարագաներ", (
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="grid flex-1 gap-1 text-[12px] font-semibold text-muted">Ավելացնել
                    <select className={numField} value={addType} onChange={(event) => setAddType(event.target.value as ItemType)}>
                      {Object.entries(ITEM_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <button type="button" className={small} onClick={() => { edit((m) => { m.items.push({ type: addType, at: center }); }); setSelection({ type: "item", index: model.items.length }); }}><Plus aria-hidden="true" size={15} /> Ավելացնել</button>
                </div>
                {onUploadIcon ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input ref={iconFile} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) pickIcon(file, cropTarget.current); }} />
                    <button type="button" className={small} disabled={uploading} onClick={() => { cropTarget.current = null; iconFile.current?.click(); }}><ImagePlus aria-hidden="true" size={15} /> {uploading ? "Վերբեռնվում է…" : "Սրբապատկեր նկարով"}</button>
                    <span className="text-[12px] text-faint">Ընտրեք նկարը, հետո 3D-ում սեղմեք պատին, որտեղ կախված է։</span>
                  </div>
                ) : null}
                {item && selection?.type === "item" ? (
                  <div className="grid gap-3 rounded-button border border-edge p-3">
                    <strong className="text-[14px] text-gold-bright">{ITEM_LABELS[item.type]}</strong>
                    <div className="grid grid-cols-3 gap-2">
                      <Num label="x (հս/հվ)" value={item.at[0]} onChange={(v) => edit((m) => { m.items[selection.index].at = [v ?? 0, item.at[1]]; })} />
                      <Num label="z (արլ/արմ)" value={item.at[1]} onChange={(v) => edit((m) => { m.items[selection.index].at = [item.at[0], v ?? 0]; })} />
                      <Num label="Բարձրություն" value={item.y} onChange={(v) => edit((m) => { m.items[selection.index].y = v; })} />
                      {item.type === "icon" || item.type === "bench" ? <Num label="Լայնություն" value={item.w} onChange={(v) => edit((m) => { m.items[selection.index].w = v; })} /> : null}
                      {item.type === "icon" || item.type === "column" ? <Num label="Բարձրություն (չափ)" value={item.h} onChange={(v) => edit((m) => { m.items[selection.index].h = v; })} /> : null}
                      {item.type === "chandelier" ? <Num label="Կախված է (մ)" value={item.top} onChange={(v) => edit((m) => { m.items[selection.index].top = v; })} /> : null}
                    </div>
                    <label className="grid gap-1 text-[12px] font-semibold text-muted">Անուն (ըստ ցանկության)
                      <input className={numField} value={item.name ?? ""} onChange={(event) => edit((m) => { m.items[selection.index].name = event.target.value || undefined; })} />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={small} onClick={() => edit((m) => { m.items[selection.index].rot = ((item.rot ?? 0) - 15) % 360; })}><RotateCcw aria-hidden="true" size={15} /> 15°</button>
                      <button type="button" className={small} onClick={() => edit((m) => { m.items[selection.index].rot = ((item.rot ?? 0) + 15) % 360; })}><RotateCw aria-hidden="true" size={15} /> 15°</button>
                      {item.type === "icon" && onUploadIcon ? <button type="button" className={small} disabled={uploading} onClick={() => { cropTarget.current = selection.index; iconFile.current?.click(); }}><ImagePlus aria-hidden="true" size={15} /> Փոխել նկարը</button> : null}
                      <button type="button" className={small} onClick={() => toWall(selection.index)}>Դնել պատի մոտ</button>
                      <button type="button" className={small} onClick={() => intoWall(selection.index, true)}>Պատի մեջ՝ կամարով</button>
                      <button type="button" className={small} onClick={() => intoWall(selection.index, false)}>Պատի մեջ՝ ուղիղ</button>
                      <button type="button" className={small} onClick={() => { edit((m) => { m.items.push({ ...(clone(item) as Mutable<Item>), at: [item.at[0] + 1, item.at[1]] }); }); setSelection({ type: "item", index: model.items.length }); }}><Copy aria-hidden="true" size={15} /> Կրկնօրինակել</button>
                      <button type="button" className={`${small} !text-danger`} onClick={() => { edit((m) => { m.items.splice(selection.index, 1); }); setSelection(null); }}><Trash2 aria-hidden="true" size={15} /> Ջնջել</button>
                    </div>
                    <p className="m-0 text-[12px] text-faint">«Պատի մեջ»՝ ամենամոտ պատում բացվում է որմնախորշ (փոս), ու պարագան կանգնում է ներսում։ Չափերը փոխվում են սենյակի «Որմնախորշեր» բաժնում։</p>
                  </div>
                ) : <p className="m-0 text-[12.5px] text-faint">Սեղմեք պարագային հատակագծում կամ 3D-ում՝ խմբագրելու։ Գիծը ցույց է տալիս, թե ուր է նայում։</p>}
              </>
            )) : null}

            {layer === "inside" && room && selection?.type === "room" ? panel(`Սենյակ՝ ${room.id}`, (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Num label="Պատերի բարձրություն" value={room.height} onChange={(v) => edit((m) => { m.rooms[selection.index].height = v ?? 1; })} />
                  <label className="grid gap-1 text-[12px] font-semibold text-muted">Առաստաղ
                    <select className={numField} value={room.ceiling} onChange={(event) => edit((m) => { m.rooms[selection.index].ceiling = event.target.value as "flat" | "open"; })}>
                      <option value="flat">Հարթ</option><option value="open">Կամարներ/գմբեթ</option>
                    </select>
                  </label>
                  {selection.vertex !== null ? (
                    <Num label={`Պատ ${selection.vertex}-ի կորություն`} value={room.outline[selection.vertex][2] ?? 0} onChange={(v) => edit((m) => {
                      const p = m.rooms[selection.index].outline[selection.vertex!];
                      m.rooms[selection.index].outline[selection.vertex!] = v ? [p[0], p[1], v] : [p[0], p[1]];
                    })} />
                  ) : null}
                </div>
                <VertexTools outline={room.outline} vertex={selection.vertex}
                  onChange={(outline) => edit((m) => { m.rooms[selection.index].outline = outline; })} onVertex={(vertex) => setSelection({ ...selection, vertex })} />
                <OpeningsEditor title="Պատուհաններ" rows={room.windows ?? []} edges={room.outline.length} windows
                  onChange={(rows) => edit((m) => { m.rooms[selection.index].windows = rows as never; })} />
                <OpeningsEditor title="Դռներ" rows={room.doors ?? []} edges={room.outline.length}
                  onChange={(rows) => edit((m) => { m.rooms[selection.index].doors = rows as never; })} />
                <NichesEditor rows={room.niches ?? []} edges={room.outline.length}
                  onChange={(rows) => edit((m) => { m.rooms[selection.index].niches = rows; })} />
              </>
            )) : null}

            {layer === "inside" ? panel("Կամարներ", (
              <>
                <p className="m-0 text-[12px] text-faint">Կամարի ծայրերը քաշվում են հատակագծում։ «Առաստաղի կամար»՝ գլանաձև կամար սենյակի վրա, «Կամար սյուներով»՝ ազատ կանգնած կամար կամ կամարաշար (սյուների թիվը)։</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={small} onClick={() => { edit((m) => { m.vaults.push({ from: [center[0], center[1] - 3], to: [center[0], center[1] + 3], width: 4, spring: 5 }); }); setSelection({ type: "vault", index: model.vaults.length, end: null }); }}><Plus aria-hidden="true" size={15} /> Առաստաղի կամար</button>
                  <button type="button" className={small} onClick={() => { edit((m) => { m.arcades.push({ from: [center[0] - 2, center[1]], to: [center[0] + 2, center[1]], count: 2, spring: 3, top: 4.8, pillar: 0.6 }); }); setSelection({ type: "arcade", index: model.arcades.length, end: null }); }}><Plus aria-hidden="true" size={15} /> Կամար սյուներով</button>
                </div>
                {model.vaults.map((v, i) => (
                  <ArchRow key={`v${i}`} title={`Առաստաղի կամար ${i + 1}`} active={selection?.type === "vault" && selection.index === i} onSelect={() => setSelection({ type: "vault", index: i, end: null })}
                    onDelete={() => { edit((m) => { m.vaults.splice(i, 1); }); setSelection(null); }}>
                    <Num label="Լայնություն" value={v.width} onChange={(x) => edit((m) => { m.vaults[i].width = x ?? 1; })} />
                    <Num label="Սկսվում է (մ)" value={v.spring} onChange={(x) => edit((m) => { m.vaults[i].spring = x ?? 1; })} />
                    <Num label="Բարձրացում" value={v.rise ?? v.width / 2} onChange={(x) => edit((m) => { m.vaults[i].rise = x; })} />
                    <Check label="Սկիզբը փակ" value={Boolean(v.closeFrom)} onChange={(on) => edit((m) => { m.vaults[i].closeFrom = on ? true : undefined; })} />
                    <Check label="Վերջը փակ" value={Boolean(v.closeTo)} onChange={(on) => edit((m) => { m.vaults[i].closeTo = on ? true : undefined; })} />
                  </ArchRow>
                ))}
                {model.arcades.map((a, i) => (
                  <ArchRow key={`a${i}`} title={a.count === 2 ? `Կամար ${i + 1}` : `Կամարաշար ${i + 1}`} active={selection?.type === "arcade" && selection.index === i} onSelect={() => setSelection({ type: "arcade", index: i, end: null })}
                    onDelete={() => { edit((m) => { m.arcades.splice(i, 1); }); setSelection(null); }}>
                    <Num label="Սյուներ" step={1} value={a.count} onChange={(x) => edit((m) => { m.arcades[i].count = Math.max(2, Math.round(x ?? 2)); })} />
                    <Num label="Կամարը սկսվում է" value={a.spring} onChange={(x) => edit((m) => { m.arcades[i].spring = x ?? 1; })} />
                    <Num label="Պատի վերև" value={a.top} onChange={(x) => edit((m) => { m.arcades[i].top = x ?? 2; })} />
                    <Num label="Սյան հաստ." value={a.pillar} onChange={(x) => edit((m) => { m.arcades[i].pillar = x ?? 0.5; })} />
                  </ArchRow>
                ))}
              </>
            )) : null}

            {layer === "outside" ? panel("Դրսի պատեր և տանիքներ", (
              <>
                <div className="flex flex-wrap gap-2">
                  {model.masses.map((_, i) => <button key={i} type="button" className={chip(selection?.type === "mass" && selection.index === i)} onClick={() => setSelection({ type: "mass", index: i, vertex: null })}>Ծավալ {i + 1}</button>)}
                  <button type="button" className={small} onClick={() => {
                    edit((m) => { m.masses.push({ outline: [[box.minX - 0.4, box.minZ - 0.4], [box.maxX + 0.4, box.minZ - 0.4], [box.maxX + 0.4, box.maxZ + 0.4], [box.minX - 0.4, box.maxZ + 0.4]], height: 6, roof: { type: "flat" } }); });
                    setSelection({ type: "mass", index: model.masses.length, vertex: null });
                  }}><Plus aria-hidden="true" size={15} /> Նոր ծավալ</button>
                </div>
                {mass && selection?.type === "mass" ? (
                  <div className="grid gap-3 rounded-button border border-edge p-3">
                    <div className="grid grid-cols-3 gap-2">
                      <Num label="Ներքևից (մ)" value={mass.base} onChange={(v) => edit((m) => { m.masses[selection.index].base = v; })} />
                      <Num label="Պատերի վերև (մ)" value={mass.height} onChange={(v) => edit((m) => { m.masses[selection.index].height = v ?? 0; })} />
                      <label className="grid gap-1 text-[12px] font-semibold text-muted">Տանիք
                        <select className={numField} value={mass.roof.type} onChange={(event) => edit((m) => {
                          const type = event.target.value;
                          m.masses[selection.index].roof = type === "gable" ? { type: "gable", axis: "z", rise: 3 } : type === "tent" ? { type: "tent", rise: 2 } : { type: "flat" };
                        })}>
                          <option value="flat">Հարթ</option><option value="gable">Երկթեք</option><option value="tent">Վրանաձև</option>
                        </select>
                      </label>
                      {mass.roof.type !== "flat" ? <Num label="Տանիքի բարձր." value={mass.roof.rise} onChange={(v) => edit((m) => { (m.masses[selection.index].roof as { rise: number }).rise = v ?? 0; })} /> : null}
                      {mass.roof.type === "gable" ? (
                        <label className="grid gap-1 text-[12px] font-semibold text-muted">Կատարը
                          <select className={numField} value={mass.roof.axis} onChange={(event) => edit((m) => { (m.masses[selection.index].roof as { axis: "x" | "z" }).axis = event.target.value as "x" | "z"; })}>
                            <option value="z">Արևելք–արևմուտք</option><option value="x">Հյուսիս–հարավ</option>
                          </select>
                        </label>
                      ) : null}
                    </div>
                    <VertexTools outline={mass.outline} vertex={selection.vertex}
                      onChange={(outline) => edit((m) => { m.masses[selection.index].outline = outline; })} onVertex={(vertex) => setSelection({ ...selection, vertex })} />
                    <button type="button" className={`${small} justify-self-start !text-danger`} onClick={() => { edit((m) => { m.masses.splice(selection.index, 1); }); setSelection(null); }}><Trash2 aria-hidden="true" size={15} /> Ջնջել ծավալը</button>
                  </div>
                ) : <p className="m-0 text-[12.5px] text-faint">Ծավալը դրսի պատերն են իրենց տանիքով։ Ընտրեք մեկը կամ սեղմեք հատակագծում։</p>}
              </>
            )) : null}

            {layer === "outside" ? panel("Գմբեթ և զանգակատուն", (
              <>
                <Check label="Գմբեթ" value={Boolean(model.dome)} onChange={(on) => edit((m) => { m.dome = on ? { at: center, radius: 3.6, base: 13, drum: 3, sides: 12, bay: 4, windows: { count: 12, w: 0.42, h: 1.5 } } : undefined; })} />
                {model.dome ? (
                  <div className="grid grid-cols-3 gap-2">
                    <Num label="Շառավիղ" value={model.dome.radius} onChange={(v) => edit((m) => { (m.dome as Mutable<Dome>).radius = v ?? 1; })} />
                    <Num label="Թմբուկի հիմք (մ)" value={model.dome.base} onChange={(v) => edit((m) => { (m.dome as Mutable<Dome>).base = v ?? 1; })} />
                    <Num label="Թմբուկի բարձր." value={model.dome.drum} onChange={(v) => edit((m) => { (m.dome as Mutable<Dome>).drum = v ?? 0; })} />
                    <Num label="Նիստեր" step={1} value={model.dome.sides} onChange={(v) => edit((m) => { (m.dome as Mutable<Dome>).sides = Math.max(4, Math.round(v ?? 12)); })} />
                    <Num label="Պատուհաններ" step={1} value={model.dome.windows?.count} onChange={(v) => edit((m) => { const d = m.dome as Mutable<Dome>; d.windows = { w: 0.42, h: 1.5, ...(d.windows ?? {}), count: Math.max(0, Math.round(v ?? 0)) }; })} />
                    <Num label="Քառակուսի (կես)" value={model.dome.bay} onChange={(v) => edit((m) => { (m.dome as Mutable<Dome>).bay = v; })} />
                  </div>
                ) : null}
                <Check label="Զանգակատուն" value={Boolean(model.belfry)} onChange={(on) => edit((m) => { m.belfry = on ? { at: [center[0], box.maxZ - 2], base: 7, radius: 1.1, columns: 6, height: 2.2 } : undefined; })} />
                {model.belfry ? (
                  <div className="grid grid-cols-3 gap-2">
                    <Num label="Հիմքը (մ)" value={model.belfry.base} onChange={(v) => edit((m) => { m.belfry!.base = v ?? 0; })} />
                    <Num label="Շառավիղ" value={model.belfry.radius} onChange={(v) => edit((m) => { m.belfry!.radius = v ?? 0.5; })} />
                    <Num label="Սյուներ" step={1} value={model.belfry.columns} onChange={(v) => edit((m) => { m.belfry!.columns = Math.max(3, Math.round(v ?? 4)); })} />
                    <Num label="Բարձրություն" value={model.belfry.height} onChange={(v) => edit((m) => { m.belfry!.height = v ?? 1; })} />
                  </div>
                ) : null}
              </>
            )) : null}
          </div>
        </>
      )}
      <p className="m-0 text-[12px] text-faint">Բեմը և պատշգամբը առայժմ փոխվում են «JSON / GPT» ներդիրում։</p>
    </div>
  );
}

/** Ուրվագծի կետեր. ավելացնել կետ պատի մեջտեղում, ջնջել կետը։ */
function VertexTools({ outline, vertex, onChange, onVertex }: { outline: readonly Vertex[]; vertex: number | null; onChange: (outline: Mutable<Vertex>[]) => void; onVertex: (vertex: number | null) => void }) {
  if (vertex === null) return <p className="m-0 text-[12.5px] text-faint">Սեղմեք անկյան կետին՝ պատը ընտրելու (կետ i → i+1 պատը i-րդն է)։</p>;
  const copy = () => outline.map((v) => [...v]) as Mutable<Vertex>[];
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={small} onClick={() => {
        const next = copy();
        const a = outline[vertex];
        const b = outline[(vertex + 1) % outline.length];
        next.splice(vertex + 1, 0, [snap((a[0] + b[0]) / 2), snap((a[1] + b[1]) / 2)]);
        onChange(next);
      }}><Plus aria-hidden="true" size={15} /> Կետ այս պատի մեջտեղում</button>
      <button type="button" className={`${small} !text-danger`} disabled={outline.length <= 3} onClick={() => { const next = copy(); next.splice(vertex, 1); onChange(next); onVertex(null); }}><Trash2 aria-hidden="true" size={15} /> Ջնջել կետը</button>
    </div>
  );
}

function ArchRow({ title, active, onSelect, onDelete, children }: { title: string; active: boolean; onSelect: () => void; onDelete: () => void; children: ReactNode }) {
  return (
    <div className={`grid gap-2 rounded-control border p-2 ${active ? "border-[rgb(217_181_111/60%)]" : "border-edge"}`}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="cursor-pointer text-[13px] font-bold text-gold-bright" onClick={onSelect}>{title}</button>
        <button type="button" className={`${small} !text-danger`} aria-label="Ջնջել" onClick={onDelete}><Trash2 aria-hidden="true" size={15} /></button>
      </div>
      <div className="grid grid-cols-3 gap-2 min-[560px]:grid-cols-5">{children}</div>
    </div>
  );
}

/** Որմնախորշեր՝ պատը, տեղը, չափերը, խորությունը, կամարով թե ոչ։ */
function NichesEditor({ rows, edges, onChange }: { rows: readonly Niche[]; edges: number; onChange: (rows: Niche[]) => void }) {
  const set = (i: number, patch: Partial<Niche>) => onChange(rows.map((row, k) => (k === i ? { ...row, ...patch } : row)));
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <strong className="text-[13px]">Որմնախորշեր (փոս պատի մեջ)</strong>
        <button type="button" className={small} onClick={() => onChange([...rows, { edge: 0, at: 1, w: 1.6, h: 2.6, depth: 0.9, arch: true }])}><Plus aria-hidden="true" size={15} /> Ավելացնել</button>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-4 gap-2 rounded-control border border-edge p-2 min-[560px]:grid-cols-8">
          <label className="grid gap-1 text-[12px] font-semibold text-muted">Պատ
            <select className={numField} value={row.edge} onChange={(event) => set(i, { edge: Number(event.target.value) })}>
              {Array.from({ length: edges }, (_, k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <Num label="Տեղը" value={row.at} onChange={(v) => set(i, { at: v ?? 0 })} />
          <Num label="Լայն." value={row.w} onChange={(v) => set(i, { w: v ?? 1 })} />
          <Num label="Բարձր." value={row.h} onChange={(v) => set(i, { h: v ?? 2 })} />
          <Num label="Խորություն" value={row.depth} onChange={(v) => set(i, { depth: v ?? 0.5 })} />
          <Check label="Կամարով" value={Boolean(row.arch)} onChange={(arch) => set(i, { arch })} />
          <button type="button" className={`${small} self-end !text-danger`} aria-label="Ջնջել" onClick={() => onChange(rows.filter((_, k) => k !== i))}><Trash2 aria-hidden="true" size={15} /></button>
        </div>
      ))}
    </div>
  );
}

type OpeningRow = { edge: number; at: number; w: number; h: number; y?: number; shape?: OpeningShape; count?: number; gap?: number; part?: string };

/** Պատուհանների կամ դռների ցուցակ՝ ամեն տողում պատը, տեղը, չափերը (պատուհանին՝ ձևն ու շարքը)։ */
function OpeningsEditor({ title, rows, edges, windows = false, onChange }: { title: string; rows: readonly OpeningRow[]; edges: number; windows?: boolean; onChange: (rows: OpeningRow[]) => void }) {
  const set = (i: number, patch: Partial<OpeningRow>) => onChange(rows.map((row, k) => (k === i ? { ...row, ...patch } : row)));
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <strong className="text-[13px]">{title}</strong>
        <button type="button" className={small} onClick={() => onChange([...rows, windows ? { edge: 0, at: 1, y: 3, w: 0.5, h: 1.5, shape: "arch" } : { edge: 0, at: 1, w: 1.2, h: 2.4 }])}><Plus aria-hidden="true" size={15} /> Ավելացնել</button>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-4 gap-2 rounded-control border border-edge p-2 min-[560px]:grid-cols-8">
          <label className="grid gap-1 text-[12px] font-semibold text-muted">Պատ
            <select className={numField} value={row.edge} onChange={(event) => set(i, { edge: Number(event.target.value) })}>
              {Array.from({ length: edges }, (_, k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <Num label="Տեղը" value={row.at} onChange={(v) => set(i, { at: v ?? 0 })} />
          {windows ? <Num label="Ներքևից" value={row.y} onChange={(v) => set(i, { y: v ?? 0 })} /> : null}
          <Num label="Լայն." value={row.w} onChange={(v) => set(i, { w: v ?? 0.5 })} />
          <Num label="Բարձր." value={row.h} onChange={(v) => set(i, { h: v ?? 1 })} />
          {windows ? (
            <>
              <label className="grid gap-1 text-[12px] font-semibold text-muted">Ձևը
                <select className={numField} value={row.shape ?? "arch"} onChange={(event) => set(i, { shape: event.target.value as OpeningShape })}>
                  {Object.entries(SHAPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <Num label="Քանակ" value={row.count} step={1} onChange={(v) => set(i, { count: v })} />
              <Num label="Միջև (մ)" value={row.gap} onChange={(v) => set(i, { gap: v })} />
            </>
          ) : null}
          <button type="button" className={`${small} self-end !text-danger`} aria-label="Ջնջել" onClick={() => onChange(rows.filter((_, k) => k !== i))}><Trash2 aria-hidden="true" size={15} /></button>
        </div>
      ))}
    </div>
  );
}
