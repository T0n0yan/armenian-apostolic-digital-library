// Սրբապատկերի նկարի կտրում (ադմինի 3D խմբագրիչ)՝ ընտրել ձևը, մատով տեղաշարժել նկարը շրջանակի մեջ, մոտեցնել։
// Արդյունքը՝ կտրված նկար (WebP, որտեղ բրաուզերը չի կարող՝ JPEG) և նրա համամասնությունը (լայնություն/բարձրություն)։
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { X } from "lucide-react";

const SHAPES = [
  { id: "3:4", label: "Ուղղահայաց", ratio: 3 / 4 },
  { id: "2:3", label: "Բարձր", ratio: 2 / 3 },
  { id: "1:1", label: "Քառակուսի", ratio: 1 },
  { id: "4:3", label: "Լայն", ratio: 4 / 3 },
] as const;
const MAX_SIDE = 1200;

const button = "inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-button border border-edge bg-subtle px-3 text-[13.5px] font-semibold text-ink disabled:cursor-default disabled:opacity-40";
const primary = "inline-flex min-h-10 cursor-pointer items-center justify-center rounded-button bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] px-4 text-[14px] font-bold text-[#2a1708] disabled:opacity-50";
const chip = (on: boolean) => `cursor-pointer rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${on ? "border-[rgb(217_181_111/60%)] bg-[rgb(217_181_111/18%)] text-gold-bright" : "border-edge bg-subtle text-ink"}`;

export function IconCrop({ file, onDone, onCancel }: { file: Blob; onDone: (image: Blob, aspect: number) => void; onCancel: () => void }) {
  const [src, setSrc] = useState("");
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [shape, setShape] = useState<(typeof SHAPES)[number]>(SHAPES[0]);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    const image = new Image();
    image.onload = () => { imageRef.current = image; setNatural({ w: image.naturalWidth, h: image.naturalHeight }); };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Շրջանակի չափը էկրանին (px)՝ ձևից կախված, ամենաշատը 300×360։
  const frameW = Math.min(300, 360 * shape.ratio);
  const frameH = frameW / shape.ratio;
  const cover = natural ? Math.max(frameW / natural.w, frameH / natural.h) : 1;
  const scale = cover * zoom;
  const clamp = (p: { x: number; y: number }, s = scale) => natural ? {
    x: Math.min(0, Math.max(frameW - natural.w * s, p.x)),
    y: Math.min(0, Math.max(frameH - natural.h * s, p.y)),
  } : p;

  // Ձևը կամ նկարը փոխելիս՝ նկարը կենտրոնում։
  useEffect(() => {
    if (!natural) return;
    const s = Math.max(frameW / natural.w, frameH / natural.h);
    setZoom(1);
    setPos({ x: (frameW - natural.w * s) / 2, y: (frameH - natural.h * s) / 2 });
  }, [natural, frameW, frameH]);

  /** Մոտեցնել՝ պահելով շրջանակի կենտրոնը տեղում։ */
  function zoomTo(next: number) {
    const z = Math.max(1, Math.min(5, next));
    const s0 = scale;
    const s1 = cover * z;
    const cx = frameW / 2;
    const cy = frameH / 2;
    setZoom(z);
    setPos((p) => clamp({ x: cx - ((cx - p.x) / s0) * s1, y: cy - ((cy - p.y) / s0) * s1 }, s1));
  }

  function down(event: ReactPointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }
  function move(event: ReactPointerEvent) {
    const last = pointers.current.get(event.pointerId);
    if (!last) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current) zoomTo(zoom * (dist / pinch.current));
      pinch.current = dist;
      return;
    }
    setPos((p) => clamp({ x: p.x + dx, y: p.y + dy }));
  }
  function up(event: ReactPointerEvent) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = 0;
  }

  async function done() {
    const image = imageRef.current;
    if (!image || !natural) return;
    setBusy(true);
    const sw = frameW / scale;
    const sh = frameH / scale;
    const out = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * out));
    canvas.height = Math.max(1, Math.round(sh * out));
    canvas.getContext("2d")?.drawImage(image, -pos.x / scale, -pos.y / scale, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
    // Safari-ն WebP չի գրում (տալիս է PNG)՝ այդ դեպքում JPEG (ավելի թեթև)։
    const final = blob?.type === "image/webp" ? blob : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    setBusy(false);
    if (final) onDone(final, canvas.width / canvas.height);
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-[rgb(0_0_0/55%)] p-4" role="dialog" aria-modal="true" aria-label="Սրբապատկերի նկարը">
      <div className="paper-card grid w-full max-w-[380px] gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <strong className="text-[15px] text-gold-bright">Սրբապատկերի նկարը</strong>
          <button type="button" className="grid size-9 cursor-pointer place-items-center rounded-full border border-edge text-muted" aria-label="Փակել" onClick={onCancel}><X aria-hidden="true" size={16} /></button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SHAPES.map((item) => <button key={item.id} type="button" className={chip(item.id === shape.id)} aria-pressed={item.id === shape.id} onClick={() => setShape(item)}>{item.label}</button>)}
        </div>
        <div className="grid place-items-center">
          <div
            className="relative cursor-grab touch-none overflow-hidden rounded-[6px] bg-subtle shadow-[0_0_0_3px_#d2a850] select-none active:cursor-grabbing"
            style={{ width: frameW, height: frameH }}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            onWheel={(event) => zoomTo(zoom * Math.exp(-event.deltaY * 0.0015))}
          >
            {src && natural ? (
              <img src={src} alt="" draggable={false} className="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left"
                style={{ width: natural.w * scale, height: natural.h * scale, transform: `translate(${pos.x}px, ${pos.y}px)` }} />
            ) : <p className="m-0 grid h-full place-items-center text-[13px] text-muted">Բեռնվում է…</p>}
          </div>
        </div>
        <label className="grid gap-1 text-[12px] font-semibold text-muted">Մոտեցնել
          <input type="range" min={1} max={5} step={0.01} value={zoom} onChange={(event) => zoomTo(Number(event.target.value))} />
        </label>
        <p className="m-0 text-[12px] text-faint">Մատով տեղաշարժեք նկարը շրջանակի մեջ, երկու մատով կամ սահիչով՝ մոտեցրեք։ Շրջանակում երևացողը կլինի սրբապատկերը։</p>
        <div className="flex justify-end gap-2">
          <button type="button" className={button} onClick={onCancel}>Չեղարկել</button>
          <button type="button" className={primary} disabled={!natural || busy} onClick={() => void done()}>{busy ? "Պատրաստվում է…" : "Պատրաստ է"}</button>
        </div>
      </div>
    </div>
  );
}
