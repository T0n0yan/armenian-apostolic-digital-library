// Ադմինի խմբագրիչ՝ եկեղեցու անձնագիրը փոխելու համար։ Հատակագծում քաշում ես սենյակների կետերն ու պարագաները,
// կողքին անմիջապես երևում է 3D-ն։ Պատուհաններ, դռներ, բարձրություններ՝ դաշտերով, մնացածը՝ JSON-ով։
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Copy, Plus, RotateCcw, RotateCw, Trash2, Undo2 } from "lucide-react";
import { fieldControl, fieldLabel } from "../components/ui-styles";
import { bounds, polygonOf, validateModel, type ChurchModel, type Item, type ItemType, type OpeningShape, type Pt, type TuffColor } from "./model";
import { gptPrompt } from "./prompt";
import { TEMPLATES } from "./templates";
import type { ChurchScene } from "./scene";

export const ITEM_LABELS: Record<ItemType, string> = {
  altar: "Սուրբ Սեղան", lectern: "Գրակալ", font: "Մկրտության ավազան", "candle-table": "Մոմավառության սեղան", chandelier: "Ջահ",
  choir: "Դաս", icon: "Սրբապատկեր", bench: "Նստարան", column: "Սյուն", chalice: "Սկիհ", gospel: "Ավետարան", censer: "Բուրվառ",
  fan: "Քշոց", candlestick: "Աշտանակ", "procession-icon": "Թափորի սրբապատկեր",
};
const TUFF_LABELS: Record<TuffColor, string> = { pink: "Վարդագույն", ochre: "Դեղնավուն", gray: "Մոխրագույն", black: "Սև" };
const SHAPE_LABELS: Record<OpeningShape, string> = { arch: "Կամարաձև", rect: "Ուղղանկյուն", round: "Կլոր", slit: "Նեղ", cross: "Խաչաձև" };

type Selection = { type: "item"; index: number } | { type: "room"; index: number; vertex: number | null } | null;
type Tab = "3d" | "plan" | "json";

const snap = (v: number) => Math.round(v * 10) / 10;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const chip = (on: boolean) => `cursor-pointer rounded-full border px-3 py-1.5 text-[13px] font-semibold ${on ? "border-[rgb(217_181_111/60%)] bg-[rgb(217_181_111/18%)] text-gold-bright" : "border-edge bg-subtle text-ink"}`;
const small = "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-edge bg-subtle px-3 text-[13px] font-semibold text-ink disabled:cursor-default disabled:opacity-40";
const numField = `${fieldControl} !min-h-9 !px-2 !py-1 text-[13px]`;

function Num({ label, value, onChange, step = 0.1 }: { label: string; value: number | undefined; onChange: (value: number | undefined) => void; step?: number }) {
  return (
    <label className="grid gap-1 text-[12px] font-semibold text-muted">{label}
      <input className={numField} type="number" inputMode="decimal" step={step} value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} />
    </label>
  );
}

/** 3D նախադիտում. տեսարանը նորից է կառուցվում փոփոխությունից 0,35 վրկ հետո (ոչ ամեն շարժման ժամանակ)։ */
function Preview({ model }: { model: ChurchModel }) {
  const host = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(model);
  useEffect(() => {
    const timer = window.setTimeout(() => setShown(model), 350);
    return () => window.clearTimeout(timer);
  }, [model]);
  useEffect(() => {
    let scene: ChurchScene | null = null;
    let cancelled = false;
    import("./scene").then(({ createChurchScene, webglAvailable }) => {
      if (!cancelled && host.current && webglAvailable()) scene = createChurchScene(host.current, { model: shown, onPick: () => {} });
    }).catch(() => {});
    return () => { cancelled = true; scene?.dispose(); };
  }, [shown]);
  return <div ref={host} className="absolute inset-0" />;
}

/** Հատակագիծ՝ քաշվող կետերով (սենյակների անկյուններ) և պարագաներով։ */
function PlanEditor({ model, selection, onSelect, onDrag, onDragEnd }: {
  model: ChurchModel; selection: Selection; onSelect: (selection: Selection) => void;
  onDrag: (target: NonNullable<Selection>, point: Pt) => void; onDragEnd: () => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<NonNullable<Selection> | null>(null);
  const box = bounds(model.rooms.flatMap((room) => polygonOf(room.outline)));
  const live = `${box.minX - 4} ${box.minZ - 4} ${box.maxX - box.minX + 8} ${box.maxZ - box.minZ + 8}`;
  // Քաշելու ընթացքում viewBox-ը չի փոխվում, որ կետը մատի տակից չփախչի։
  const frozen = useRef<string | null>(null);
  const viewBox = frozen.current ?? live;
  const toPlan = (event: ReactPointerEvent): Pt => {
    const element = svg.current!;
    const point = element.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const p = point.matrixTransform(element.getScreenCTM()!.inverse());
    return [snap(p.x), snap(p.y)];
  };
  const start = (target: NonNullable<Selection>) => (event: ReactPointerEvent) => {
    event.stopPropagation();
    onSelect(target);
    dragging.current = target;
    frozen.current = live;
    svg.current?.setPointerCapture(event.pointerId);
  };
  return (
    <svg ref={svg} className="h-full w-full touch-none select-none" viewBox={viewBox}
      onPointerMove={(event) => { if (dragging.current) onDrag(dragging.current, toPlan(event)); }}
      onPointerUp={() => { if (dragging.current) { dragging.current = null; frozen.current = null; onDragEnd(); } }}
      onPointerDown={() => onSelect(null)}>
      <text x={(box.minX + box.maxX) / 2} y={box.minZ - 2.6} textAnchor="middle" className="fill-gold" fontSize="0.8" fontWeight="700">Արևելք ↑</text>
      {model.masses.map((mass, i) => (
        <polygon key={`m${i}`} points={polygonOf(mass.outline).map((p) => p.join(",")).join(" ")} fill="none" stroke="rgb(217 181 111 / 25%)" strokeWidth="0.06" strokeDasharray="0.4 0.3" />
      ))}
      {model.rooms.map((room, i) => {
        const on = selection?.type === "room" && selection.index === i;
        return (
          <polygon key={room.id + i} points={polygonOf(room.outline).map((p) => p.join(",")).join(" ")}
            fill={on ? "rgb(217 181 111 / 22%)" : "rgb(217 181 111 / 9%)"} stroke="rgb(217 181 111 / 75%)" strokeWidth="0.12"
            className="cursor-pointer" onPointerDown={(event) => { event.stopPropagation(); onSelect({ type: "room", index: i, vertex: null }); }} />
        );
      })}
      {model.bema ? <polygon points={polygonOf(model.bema.outline).map((p) => p.join(",")).join(" ")} fill="rgb(217 181 111 / 14%)" stroke="rgb(217 181 111 / 60%)" strokeWidth="0.08" pointerEvents="none" /> : null}
      {model.rooms.map((room, i) => room.outline.map((v, j) => {
        const on = selection?.type === "room" && selection.index === i && selection.vertex === j;
        return (
          <circle key={`v${i}-${j}`} cx={v[0]} cy={v[1]} r={on ? 0.42 : 0.3} className="cursor-grab" fill={on ? "#e2c27e" : "var(--page-bg)"} stroke="#b07d2e" strokeWidth="0.1"
            onPointerDown={start({ type: "room", index: i, vertex: j })} />
        );
      }))}
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
    </svg>
  );
}

export function ChurchEditor({ initial, placeId, placeName, saving, errors, onSave }: {
  initial: ChurchModel | null; placeId: string; placeName: string; saving: boolean; errors: string[]; onSave: (model: ChurchModel) => void;
}) {
  const fresh = () => ({ ...clone(TEMPLATES[0]), id: placeId, name: placeName, cameras: undefined });
  const [model, setModel] = useState<ChurchModel>(() => initial ?? fresh());
  const [past, setPast] = useState<ChurchModel[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [tab, setTab] = useState<Tab>("plan");
  const [json, setJson] = useState("");
  const [jsonErrors, setJsonErrors] = useState<string[]>([]);
  const [copied, setCopied] = useState("");
  const [addType, setAddType] = useState<ItemType>("bench");
  const dragBase = useRef<ChurchModel | null>(null);
  const dirty = useMemo(() => JSON.stringify(model) !== JSON.stringify(initial), [model, initial]);

  const commit = (next: ChurchModel) => {
    setPast((list) => [...list.slice(-39), model]);
    setModel(next);
  };
  const edit = (change: (draft: ChurchModel) => void) => {
    const draft = clone(model) as { -readonly [K in keyof ChurchModel]: ChurchModel[K] };
    change(draft as ChurchModel);
    commit(draft as ChurchModel);
  };
  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast((list) => list.slice(0, -1));
    setModel(previous);
    setSelection(null);
  };
  type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
  const mut = (m: ChurchModel) => m as unknown as Mutable<ChurchModel>;

  function drag(target: NonNullable<Selection>, point: Pt) {
    if (!dragBase.current) dragBase.current = model;
    setModel((current) => {
      const next = mut(clone(current));
      if (target.type === "item") next.items[target.index].at = [point[0], point[1]];
      else if (target.vertex !== null) {
        const v = next.rooms[target.index].outline[target.vertex];
        next.rooms[target.index].outline[target.vertex] = v.length === 3 ? [point[0], point[1], v[2]] : [point[0], point[1]];
      }
      return next as ChurchModel;
    });
  }
  function dragEnd() {
    const base = dragBase.current;
    dragBase.current = null;
    if (base) setPast((list) => [...list.slice(-39), base]);
  }

  function applyJson() {
    try {
      const { model: parsed, errors: problems } = validateModel(JSON.parse(json));
      setJsonErrors(problems);
      if (parsed) { commit(parsed); setSelection(null); }
    } catch {
      setJsonErrors(["JSON-ը կարդալ չհաջողվեց. ստուգեք փակագծերն ու ստորակետերը"]);
    }
  }
  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); setCopied(what); window.setTimeout(() => setCopied(""), 2000); } catch { setCopied(""); }
  }

  const item = selection?.type === "item" ? model.items[selection.index] : null;
  const room = selection?.type === "room" ? model.rooms[selection.index] : null;
  const center = (() => { const b = bounds(model.rooms.flatMap((r) => polygonOf(r.outline))); return [snap((b.minX + b.maxX) / 2), snap((b.minZ + b.maxZ) / 2)] as Pt; })();

  const panel = (title: string, children: ReactNode) => (
    <section className="paper-panel grid gap-3 px-4 py-4">
      <h3 className="m-0 text-[12px] font-bold tracking-[1.2px] text-gold uppercase">{title}</h3>
      {children}
    </section>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={small} disabled={!past.length} onClick={undo}><Undo2 aria-hidden="true" size={15} /> Հետ</button>
        <button type="button" className={`${small} !border-[rgb(217_181_111/60%)] !bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] !text-[#2a1708]`} disabled={saving || !dirty} onClick={() => onSave(model)}>
          {saving ? "Պահվում է…" : dirty ? "Պահել սևագիրը" : "Պահված է"}
        </button>
        <span className="text-[12px] text-faint">Սևագիրը կայքում չի երևում, մինչև տերը չհրապարակի։</span>
      </div>
      {errors.length ? <ul className="m-0 grid gap-1 rounded-button border border-danger/40 bg-danger/5 px-4 py-3 text-[13px] text-danger">{errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}

      {panel("Սկսել ձևանմուշից", (
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((template) => (
            <button key={template.id} type="button" className={chip(false)} onClick={() => {
              if (window.confirm(`Փոխարինե՞լ ամբողջ մոդելը «${template.name}» ձևանմուշով։ (Հետ կոճակով կարելի է վերադարձնել)`)) {
                commit({ ...clone(template), id: placeId, name: placeName, cameras: undefined });
                setSelection(null);
              }
            }}>{template.name}</button>
          ))}
        </div>
      ))}

      <div className="paper-card flex gap-1 p-1.5" role="tablist">
        {([["plan", "Հատակագիծ"], ["3d", "3D"], ["json", "JSON / GPT"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); if (id === "json") { setJson(JSON.stringify(model, null, 2)); setJsonErrors([]); } }}
            className={`min-h-10 flex-1 cursor-pointer rounded-button px-2 text-[13.5px] font-bold ${tab === id ? "bg-[rgb(217_181_111/18%)] text-gold-bright shadow-[inset_0_0_0_1px_rgb(217_181_111/55%)]" : "text-muted"}`}>{label}</button>
        ))}
      </div>

      {tab === "json" ? (
        <section className="paper-panel grid gap-3 px-4 py-4">
          <p className="m-0 text-[13px] leading-[1.6] text-muted">
            GPT-ով. սեղմեք «Պատճենել GPT-ի հրահանգը», տվեք GPT-ին եկեղեցու նկարների (դրսից, ներսից, հատակագիծ) հետ, պատասխանը տեղադրեք այստեղ և սեղմեք «Կիրառել»։ Արդյունքը մոտավոր կլինի. ճշգրտեք հատակագծում։
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={small} onClick={() => copy(gptPrompt(TEMPLATES[0], placeName), "prompt")}><Copy aria-hidden="true" size={15} /> {copied === "prompt" ? "Պատճենված է" : "Պատճենել GPT-ի հրահանգը"}</button>
            <button type="button" className={small} onClick={() => copy(JSON.stringify(model, null, 2), "json")}><Copy aria-hidden="true" size={15} /> {copied === "json" ? "Պատճենված է" : "Պատճենել JSON"}</button>
          </div>
          <textarea className={`${fieldControl} min-h-[320px] font-mono text-[12px] leading-[1.45]`} spellCheck={false} value={json} onChange={(event) => setJson(event.target.value)} />
          {jsonErrors.length ? <ul className="m-0 grid gap-1 text-[12.5px] text-danger">{jsonErrors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
          <button type="button" className={`${small} justify-self-start`} onClick={applyJson}>Կիրառել</button>
        </section>
      ) : (
        <div className="grid gap-4 min-[960px]:grid-cols-2">
          <div className="paper-card relative h-[min(62svh,560px)] min-h-[340px] overflow-hidden">
            {tab === "plan"
              ? <div className="absolute inset-0 p-2"><PlanEditor model={model} selection={selection} onSelect={setSelection} onDrag={drag} onDragEnd={dragEnd} /></div>
              : <Preview model={model} />}
            {tab === "plan" ? <p className="pointer-events-none absolute right-0 bottom-1.5 left-0 m-0 text-center text-[11.5px] text-faint">Քաշեք կետերը և պարագաները · սեղմեք սենյակին՝ ընտրելու</p> : null}
          </div>
          <div className="hidden min-[960px]:block">
            {tab === "plan" ? <div className="paper-card relative h-[min(62svh,560px)] min-h-[340px] overflow-hidden"><Preview model={model} /></div> : null}
          </div>
        </div>
      )}

      {tab !== "json" ? (
        <div className="grid gap-4 min-[960px]:grid-cols-2">
          {panel("Ընդհանուր", (
            <div className="grid gap-3 min-[560px]:grid-cols-2">
              <label className={fieldLabel}>Անունը<input className={fieldControl} value={model.name} onChange={(event) => edit((m) => { mut(m).name = event.target.value; })} /></label>
              <label className={fieldLabel}>Քարի գույնը
                <select className={fieldControl} value={model.tuff} onChange={(event) => edit((m) => { mut(m).tuff = event.target.value as TuffColor; })}>
                  {Object.entries(TUFF_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
          ))}

          {panel("Պարագաներ", (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <label className="grid flex-1 gap-1 text-[12px] font-semibold text-muted">Ավելացնել
                  <select className={numField} value={addType} onChange={(event) => setAddType(event.target.value as ItemType)}>
                    {Object.entries(ITEM_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <button type="button" className={small} onClick={() => { edit((m) => { mut(m).items.push({ type: addType, at: [center[0], center[1]] }); }); setSelection({ type: "item", index: model.items.length }); setTab("plan"); }}><Plus aria-hidden="true" size={15} /> Ավելացնել</button>
              </div>
              {item && selection?.type === "item" ? (
                <div className="grid gap-3 rounded-button border border-edge p-3">
                  <strong className="text-[14px] text-gold-bright">{ITEM_LABELS[item.type]}</strong>
                  <div className="grid grid-cols-3 gap-2">
                    <Num label="x (հս/հվ)" value={item.at[0]} onChange={(v) => edit((m) => { mut(m).items[selection.index].at = [v ?? 0, item.at[1]]; })} />
                    <Num label="z (արլ/արմ)" value={item.at[1]} onChange={(v) => edit((m) => { mut(m).items[selection.index].at = [item.at[0], v ?? 0]; })} />
                    <Num label="Բարձրություն" value={item.y} onChange={(v) => edit((m) => { mut(m).items[selection.index].y = v; })} />
                    {item.type === "icon" || item.type === "bench" ? <Num label="Լայնություն" value={item.w} onChange={(v) => edit((m) => { mut(m).items[selection.index].w = v; })} /> : null}
                    {item.type === "icon" || item.type === "column" ? <Num label="Բարձրություն (չափ)" value={item.h} onChange={(v) => edit((m) => { mut(m).items[selection.index].h = v; })} /> : null}
                    {item.type === "chandelier" ? <Num label="Կախված է (մ)" value={item.top} onChange={(v) => edit((m) => { mut(m).items[selection.index].top = v; })} /> : null}
                  </div>
                  <label className="grid gap-1 text-[12px] font-semibold text-muted">Անուն (ըստ ցանկության)
                    <input className={numField} value={item.name ?? ""} onChange={(event) => edit((m) => { mut(m).items[selection.index].name = event.target.value || undefined; })} />
                  </label>
                  {item.type === "font" ? (
                    <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={Boolean(item.niche)} onChange={(event) => edit((m) => { mut(m).items[selection.index].niche = event.target.checked; })} /> Որմնախորշով</label>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={small} onClick={() => edit((m) => { mut(m).items[selection.index].rot = ((item.rot ?? 0) - 15) % 360; })}><RotateCcw aria-hidden="true" size={15} /> 15°</button>
                    <button type="button" className={small} onClick={() => edit((m) => { mut(m).items[selection.index].rot = ((item.rot ?? 0) + 15) % 360; })}><RotateCw aria-hidden="true" size={15} /> 15°</button>
                    <button type="button" className={small} onClick={() => { edit((m) => { mut(m).items.push({ ...(clone(item) as Mutable<Item>), at: [item.at[0] + 1, item.at[1]] }); }); setSelection({ type: "item", index: model.items.length }); }}><Copy aria-hidden="true" size={15} /> Կրկնօրինակել</button>
                    <button type="button" className={`${small} !text-danger`} onClick={() => { edit((m) => { mut(m).items.splice(selection.index, 1); }); setSelection(null); }}><Trash2 aria-hidden="true" size={15} /> Ջնջել</button>
                  </div>
                </div>
              ) : <p className="m-0 text-[12.5px] text-faint">Հատակագծում սեղմեք պարագային (քառակուսի)՝ խմբագրելու։ Գիծը ցույց է տալիս, թե ուր է նայում։</p>}
            </>
          ))}

          {room && selection?.type === "room" ? panel(`Սենյակ՝ ${room.id}`, (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Num label="Պատերի բարձրություն" value={room.height} onChange={(v) => edit((m) => { mut(m).rooms[selection.index].height = v ?? 1; })} />
                <label className="grid gap-1 text-[12px] font-semibold text-muted">Առաստաղ
                  <select className={numField} value={room.ceiling} onChange={(event) => edit((m) => { mut(m).rooms[selection.index].ceiling = event.target.value as "flat" | "open"; })}>
                    <option value="flat">Հարթ</option><option value="open">Կամարներ/գմբեթ</option>
                  </select>
                </label>
                {selection.vertex !== null ? (
                  <Num label={`Պատ ${selection.vertex}-ի կորություն`} value={room.outline[selection.vertex][2] ?? 0} onChange={(v) => edit((m) => {
                    const p = m.rooms[selection.index].outline[selection.vertex!];
                    mut(m).rooms[selection.index].outline[selection.vertex!] = v ? [p[0], p[1], v] : [p[0], p[1]];
                  })} />
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {selection.vertex !== null ? (
                  <>
                    <button type="button" className={small} onClick={() => edit((m) => {
                      const o = m.rooms[selection.index].outline;
                      const a = o[selection.vertex!];
                      const b = o[(selection.vertex! + 1) % o.length];
                      mut(m).rooms[selection.index].outline.splice(selection.vertex! + 1, 0, [snap((a[0] + b[0]) / 2), snap((a[1] + b[1]) / 2)]);
                    })}><Plus aria-hidden="true" size={15} /> Կետ այս պատի մեջտեղում</button>
                    <button type="button" className={`${small} !text-danger`} disabled={room.outline.length <= 3} onClick={() => { edit((m) => { mut(m).rooms[selection.index].outline.splice(selection.vertex!, 1); }); setSelection({ ...selection, vertex: null }); }}><Trash2 aria-hidden="true" size={15} /> Ջնջել կետը</button>
                  </>
                ) : <p className="m-0 text-[12.5px] text-faint">Սեղմեք անկյան կետին՝ պատը ընտրելու (կետ i → i+1 պատը i-րդն է)։</p>}
              </div>
              <OpeningsEditor title="Պատուհաններ" rows={room.windows ?? []} edges={room.outline.length} windows
                onChange={(rows) => edit((m) => { mut(m).rooms[selection.index].windows = rows as never; })} />
              <OpeningsEditor title="Դռներ" rows={room.doors ?? []} edges={room.outline.length}
                onChange={(rows) => edit((m) => { mut(m).rooms[selection.index].doors = rows as never; })} />
            </>
          )) : null}
        </div>
      ) : null}
      <p className="m-0 text-[12px] text-faint">Կամարները, գմբեթը, բեմը, պատշգամբը և դրսի ծավալները փոխվում են «JSON / GPT» ներդիրում։</p>
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
