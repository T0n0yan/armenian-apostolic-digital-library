import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, X, ZoomIn } from "lucide-react";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { seoMeta } from "../utils/seo";
import { CHURCH_PARTS, LITURGY_TOUR, PART_BY_ID, type ChurchPart } from "../church3d/parts";
import { ChurchPlan } from "../church3d/church-plan";
import type { ChurchScene, ViewMode } from "../church3d/scene";

// Փորձնական էջ՝ եկեղեցու կառուցվածքը 3D-ով։ Թաքնված է (ոչ մի տեղից հղված չէ, noindex)։

export function meta() {
  return seoMeta({
    title: "Եկեղեցու կառուցվածքը — Apostolic.am",
    description: "Հայ Առաքելական եկեղեցու կառուցվածքը ներսից և դրսից՝ խորան, բեմ, Սուրբ Սեղան, ավանդատուն, ավազան, գմբեթ, զանգակատուն։",
    path: "/church-3d",
    index: false,
  });
}

type Mode = ViewMode | "plan";
type Status = "loading" | "ready" | "fallback";

const MODES: Array<{ id: Mode; label: string }> = [
  { id: "cutaway", label: "Ներսից" },
  { id: "outside", label: "Դրսից" },
  { id: "plan", label: "Հատակագիծ" },
];

const segment = (on: boolean) => `min-h-10 flex-1 cursor-pointer rounded-button px-2 text-[13.5px] font-bold ${on ? "bg-[rgb(217_181_111/18%)] text-gold-bright shadow-[inset_0_0_0_1px_rgb(217_181_111/55%)]" : "text-muted"}`;
const chip = (on: boolean) => `cursor-pointer rounded-full border px-3 py-1.5 text-[13px] font-semibold ${on ? "border-[rgb(217_181_111/60%)] bg-[rgb(217_181_111/18%)] text-gold-bright" : "border-edge bg-subtle text-ink"}`;
const iconButton = "grid size-9 cursor-pointer place-items-center rounded-full border border-edge bg-[var(--sheet-bg)] text-gold-bright";
const primary = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-button bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] px-4 text-[14.5px] font-bold text-[#2a1708]";
const secondary = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-button border border-edge bg-subtle px-3 text-[14px] font-semibold text-ink disabled:cursor-default disabled:opacity-40";
const heading = "m-0 font-noto text-[17px] font-semibold text-gold-bright";

export default function Church3D() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ChurchScene | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [mode, setMode] = useState<Mode>("cutaway");
  const [selected, setSelected] = useState<string | null>(null);
  const [tour, setTour] = useState<number | null>(null);
  // Կետի սեղմումը գալիս է three.js-ից. ref-ը՝ որ միշտ վերջին ֆունկցիան կանչվի։
  const pickRef = useRef<(id: string) => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    // three.js-ը բեռնվում է միայն այս էջում և միայն բրաուզերում։
    import("../church3d/scene").then(({ createChurchScene, webglAvailable }) => {
      if (cancelled || !hostRef.current) return;
      if (!webglAvailable()) {
        setStatus("fallback");
        setMode("plan");
        return;
      }
      sceneRef.current = createChurchScene(hostRef.current, { parts: CHURCH_PARTS, onPick: (id) => pickRef.current(id) });
      setStatus("ready");
    }).catch(() => {
      if (cancelled) return;
      setStatus("fallback");
      setMode("plan");
    });
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  function select(id: string | null) {
    setSelected(id);
    sceneRef.current?.select(id);
  }

  function changeMode(next: Mode) {
    if (tour !== null) endTour();
    setMode(next);
    if (next !== "plan") sceneRef.current?.setMode(next);
  }

  /** Տեսախցիկը տանում է մասի մոտ (անհրաժեշտության դեպքում փոխում է ներս/դուրս)։ */
  function goTo(part: ChurchPart) {
    const scene = sceneRef.current;
    select(part.id);
    if (!scene) return;
    const view: ViewMode = part.view === "outside" ? "outside" : "cutaway";
    if (tour !== null) endTour();
    setMode(view);
    scene.setMode(view);
    scene.focus(part.eye, part.look ?? part.at);
  }

  pickRef.current = (id) => select(id === selected ? null : id);

  function showStep(index: number) {
    const step = LITURGY_TOUR[index];
    setTour(index);
    setMode("cutaway");
    select(step.part);
    sceneRef.current?.showTour(step);
  }

  function endTour() {
    setTour(null);
    sceneRef.current?.showTour(null);
  }

  const part = selected ? PART_BY_ID.get(selected) : undefined;
  const step = tour === null ? null : LITURGY_TOUR[tour];
  const can3d = status !== "fallback";

  return (
    <PageShell>
      <SiteNav />
      <PageHeader showSearch={false} backTo="/" backLabel="Գրադարան" title="Եկեղեցու կառուցվածքը" />
      <div className="mt-4 grid gap-4">
        {can3d ? (
          <div className="paper-card flex gap-1 p-1.5" role="tablist" aria-label="Տեսք">
            {MODES.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={mode === item.id} className={segment(mode === item.id)} onClick={() => changeMode(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="paper-card relative h-[min(64svh,560px)] min-h-[320px] overflow-hidden">
          <div ref={hostRef} className={`absolute inset-0 ${mode === "plan" ? "invisible" : ""}`} />
          {mode === "plan" ? (
            <div className="absolute inset-0 p-3"><ChurchPlan parts={CHURCH_PARTS} selected={selected} onPick={(id) => select(id === selected ? null : id)} /></div>
          ) : null}
          {status === "loading" && mode !== "plan" ? (
            <p className="absolute inset-0 m-0 grid place-items-center text-[14px] text-muted">Բեռնվում է…</p>
          ) : null}
          {status === "ready" && mode !== "plan" ? (
            <>
              <button type="button" className={`${iconButton} absolute top-2.5 right-2.5`} aria-label="Սկզբնական տեսք" onClick={() => sceneRef.current?.reset()}>
                <RotateCcw aria-hidden="true" size={17} />
              </button>
              <p className="pointer-events-none absolute right-0 bottom-2 left-0 m-0 text-center text-[12px] text-faint">Մատով՝ պտտել · երկու մատով՝ մոտեցնել</p>
            </>
          ) : null}
        </div>

        {step ? (
          <section className="paper-panel grid gap-3 px-5 py-4" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold tracking-[1.2px] text-gold uppercase">Պատարագից առաջ · {tour! + 1}/{LITURGY_TOUR.length}</span>
              <button type="button" className={iconButton} aria-label="Ավարտել" onClick={endTour}><X aria-hidden="true" size={17} /></button>
            </div>
            <h2 className={heading}>{step.title}</h2>
            <p className="m-0 text-[14.5px] leading-[1.7] text-ink">{step.text}</p>
            <span className="text-[12px] text-faint">⚑ Ճշտել՝ հոգևորականի հետ</span>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={secondary} disabled={tour === 0} onClick={() => showStep(tour! - 1)}><ChevronLeft aria-hidden="true" size={18} /> Նախորդ</button>
              {tour! < LITURGY_TOUR.length - 1
                ? <button type="button" className={primary} onClick={() => showStep(tour! + 1)}>Հաջորդ <ChevronRight aria-hidden="true" size={18} /></button>
                : <button type="button" className={primary} onClick={endTour}>Ավարտել</button>}
            </div>
          </section>
        ) : part ? (
          <section className="paper-panel grid gap-2.5 px-5 py-4" aria-live="polite">
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-0.5">
                <h2 className={heading}>{part.name}</h2>
                {part.aka ? <span className="text-[13px] text-muted">նաև՝ {part.aka}</span> : null}
              </div>
              <button type="button" className={iconButton} aria-label="Փակել" onClick={() => select(null)}><X aria-hidden="true" size={17} /></button>
            </div>
            <p className="m-0 text-[14.5px] leading-[1.7] text-ink">{part.text}</p>
            {part.check ? <span className="text-[12px] text-faint">⚑ Ճշտել՝ հոգևորականի հետ</span> : null}
            {can3d ? (
              <button type="button" className={`${secondary} justify-self-start`} onClick={() => goTo(part)}><ZoomIn aria-hidden="true" size={17} /> Մոտիկից</button>
            ) : null}
          </section>
        ) : null}

        <section className="paper-panel grid gap-3 px-5 py-4">
          <h2 className={heading}>Եկեղեցու մասերը</h2>
          {(["inside", "outside"] as const).map((view) => (
            <div key={view} className="grid gap-2">
              <span className="text-[11px] font-bold tracking-[1.2px] text-gold uppercase">{view === "inside" ? "Ներսում" : "Դրսում"}</span>
              <div className="flex flex-wrap gap-2">
                {CHURCH_PARTS.filter((item) => item.view === view).map((item) => (
                  <button key={item.id} type="button" aria-pressed={selected === item.id} className={chip(selected === item.id)}
                    onClick={() => (can3d ? goTo(item) : select(item.id))}>
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        {can3d && !step ? (
          <section className="paper-panel grid gap-3 px-5 py-4">
            <h2 className={heading}>Պատարագից առաջ</h2>
            <p className="m-0 text-[14.5px] leading-[1.7] text-ink">Քայլ առ քայլ՝ ինչ է անում քահանան եկեղեցի մտնելուց մինչև բեմ բարձրանալը։</p>
            <button type="button" className={`${primary} justify-self-start`} disabled={status !== "ready"} onClick={() => showStep(0)}>Սկսել</button>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}
