// «Եկեղեցական սպասք՝ 3D». ցուցափեղկ «Խորհրդանիշներ և եկեղեցական առարկաներ» էջում (`/church/symbols`)։
// three.js-ը բեռնվում է միայն այստեղ (dynamic import), որ մնացած էջերը չծանրանան։
import { useEffect, useRef, useState } from "react";
import { DoorOpen, Pause, Play, RotateCcw } from "lucide-react";
import { Corner, FullscreenButton, canvasButton } from "../church3d/canvas-tools";
import { groupTitle } from "../components/etiquette-ui";
import { VESSELS, type VesselId } from "./items";
import type { VesselViewer } from "./viewer";

const flag = "w-fit rounded-chip bg-[rgb(178_72_63/12%)] px-2 py-0.5 text-[11.5px] font-bold text-danger";

export function VesselsGallery() {
  const [id, setId] = useState<VesselId>("burvar");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [spin, setSpin] = useState(true);
  const [lidOpen, setLidOpen] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<VesselViewer | null>(null);
  const vessel = VESSELS.find((item) => item.id === id) ?? VESSELS[0];

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setSpin(true); setLidOpen(true);
    import("./viewer").then(({ createVesselViewer, webglAvailable }) => {
      if (cancelled || !hostRef.current) return;
      if (!webglAvailable()) { setFailed(true); setLoading(false); return; }
      viewerRef.current = createVesselViewer(hostRef.current, id, () => { if (!cancelled) setLoading(false); });
    }).catch(() => { if (!cancelled) { setFailed(true); setLoading(false); } });
    return () => { cancelled = true; viewerRef.current?.dispose(); viewerRef.current = null; };
  }, [id]);

  const toggleSpin = () => { const next = !spin; setSpin(next); viewerRef.current?.setAutoRotate(next); };
  const toggleLid = () => { const toggle = viewerRef.current?.toggleLid; if (toggle) setLidOpen(toggle()); };

  return (
    <section className="mt-6 grid gap-2" aria-labelledby="vessels-3d">
      <h2 className={groupTitle} id="vessels-3d">Եկեղեցական սպասք՝ 3D</h2>
      <div ref={cardRef} className="vessel-stage paper-card relative h-[min(68svh,600px)] min-h-[360px] overflow-hidden">
        {failed ? (
          <img className="absolute inset-0 m-auto max-h-[90%] max-w-[90%] object-contain" src={vessel.thumb} alt={vessel.title} />
        ) : (
          <div ref={hostRef} className="absolute inset-0" />
        )}
        {loading ? <div className="vessel-loading absolute inset-0 grid place-items-center text-[13px] font-semibold text-[#e2c27e]" aria-live="polite">Բեռնվում է…</div> : null}
        <Corner at="top-right">
          <FullscreenButton target={cardRef} />
        </Corner>
        {!failed ? (
          <Corner at="bottom-right">
            {id === "burvar" ? (
              <button type="button" className={canvasButton} aria-label={lidOpen ? "Փակել կափարիչը" : "Բացել կափարիչը"} title={lidOpen ? "Փակել կափարիչը" : "Բացել կափարիչը"} onClick={toggleLid}>
                <DoorOpen aria-hidden="true" size={16} />
              </button>
            ) : null}
            <button type="button" className={canvasButton} aria-label={spin ? "Կանգնեցնել պտույտը" : "Պտտել"} title={spin ? "Կանգնեցնել պտույտը" : "Պտտել"} onClick={toggleSpin}>
              {spin ? <Pause aria-hidden="true" size={16} /> : <Play aria-hidden="true" size={16} />}
            </button>
            <button type="button" className={canvasButton} aria-label="Սկզբնական տեսք" title="Սկզբնական տեսք" onClick={() => viewerRef.current?.reset()}>
              <RotateCcw aria-hidden="true" size={16} />
            </button>
          </Corner>
        ) : null}
        <p className="pointer-events-none absolute bottom-3 left-3 m-0 max-w-[55%] text-[11.5px] leading-snug text-[rgb(240_225_200/70%)]">Մատով պտտեք, երկու մատով մեծացրեք</p>
      </div>

      <div className="vessel-thumbs flex gap-2 overflow-x-auto px-0.5 pt-1 pb-2" role="tablist" aria-label="Ընտրել առարկան">
        {VESSELS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={item.id === id} onClick={() => setId(item.id)}
            className={`paper-card grid w-[84px] shrink-0 cursor-pointer justify-items-center gap-1 rounded-button p-1.5 ${item.id === id ? "chip-on" : ""}`}>
            <img className="h-[72px] w-full object-contain" src={item.thumb} alt="" loading="lazy" decoding="async" />
            <span className="line-clamp-2 text-center text-[11.5px] leading-tight font-semibold text-ink">{item.title}</span>
          </button>
        ))}
      </div>

      <div className="paper-panel rounded-card grid gap-1.5 px-4 py-3">
        <h3 className="m-0 font-noto text-[18px] font-semibold text-ink">{vessel.title}</h3>
        <span className={flag}>⚑ Ճշտել</span>
        <p className="reading-body m-0 text-[14.5px] leading-[1.65] text-ink">{vessel.text}</p>
        <p className="m-0 text-[12px] leading-snug text-muted">Մոդելը կառուցված է մեկ լուսանկարից. հետևի կողմում երևում է առջևի պատկերը։</p>
      </div>
    </section>
  );
}
