import { Plus } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

// Գույն ընտրելու կոկիկ պատուհան story-ի խմբագրի համար. «Ավտո», մի քանի պատրաստի գույն,
// վերջին ընտրվածները և սեփական գույնը՝ պայծառության քառակուսի + երանգի սահիչ + HEX։

type Hsv = { h: number; s: number; v: number };

function hexToHsv(hex: string): Hsv {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max ? delta / max : 0, v: max };
}

function hsvToHex({ h, s, v }: Hsv) {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))).toString(16).padStart(2, "0");
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`;
}

const isHex = (value: string) => /^#[0-9a-f]{6}$/iu.test(value);

/** Կայքի ոճին համապատասխան պատրաստի գույներ։ */
export const STORY_PRESETS = ["#f7ecd2", "#ffffff", "#e8c57f", "#c9953f", "#6e1f2b", "#24150d"];

export function StoryColorPicker({ value, recent, onChange, disabled = false }: {
  value: string;
  recent: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(isHex(value) ? value : "#e8c57f"));
  const [draft, setDraft] = useState(isHex(value) ? value : "#e8c57f");
  const areaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isHex(value)) return;
    setDraft(value);
    setHsv((current) => (hsvToHex(current) === value.toLowerCase() ? current : hexToHsv(value)));
  }, [value]);

  const apply = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setDraft(hex);
    onChange(hex);
  };

  const pick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = areaRef.current?.getBoundingClientRect();
    if (!box) return;
    const s = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const v = Math.min(1, Math.max(0, 1 - (event.clientY - box.top) / box.height));
    apply({ ...hsv, s, v });
  };

  const swatches = [...STORY_PRESETS, ...recent.filter((color) => !STORY_PRESETS.includes(color))].slice(0, 10);
  const customActive = isHex(value) && !swatches.includes(value);
  const dot = "size-8 shrink-0 cursor-pointer rounded-full border-2 transition-transform active:scale-90";

  return (
    <div className={`grid gap-2.5 ${disabled ? "pointer-events-none opacity-45" : ""}`} aria-disabled={disabled}>
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5" role="radiogroup" aria-label="Գույն">
        <button type="button" role="radio" aria-checked={value === "auto"} onClick={() => onChange("auto")}
          className={`min-h-8 shrink-0 cursor-pointer rounded-full border-2 px-3 text-[12px] font-bold text-ink ${value === "auto" ? "border-[#d9b56f] bg-[rgb(217_181_111/18%)]" : "border-edge bg-subtle"}`}>Ավտո</button>
        {swatches.map((color) => (
          <button key={color} type="button" role="radio" aria-checked={value === color} aria-label={color} title={color}
            className={`${dot} ${value === color ? "border-[#d9b56f] shadow-[0_0_0_2px_rgb(217_181_111/45%)]" : "border-[rgb(127_127_127/30%)]"}`}
            style={{ background: color }} onClick={() => onChange(color)} />
        ))}
        <button type="button" aria-expanded={open} aria-label="Ընտրել այլ գույն" title="Ընտրել այլ գույն"
          className={`${dot} grid place-items-center ${open || customActive ? "border-[#d9b56f]" : "border-transparent"}`}
          style={{ background: customActive ? value : "conic-gradient(from 90deg, #f55, #fb4, #ee5, #5d7, #4cf, #66f, #c5f, #f55)" }}
          onClick={() => setOpen(!open)}>
          {customActive ? null : <Plus size={14} className="text-white drop-shadow" aria-hidden="true" />}
        </button>
      </div>

      {open ? (
        <div className="grid gap-2.5 rounded-button border border-edge bg-subtle p-3">
          <div ref={areaRef} className="relative h-[132px] cursor-crosshair touch-none overflow-hidden rounded-control"
            style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); pick(event); }}
            onPointerMove={(event) => { if (event.buttons) pick(event); }}>
            <span className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgb(0_0_0/35%),0_2px_6px_rgb(0_0_0/40%)]"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) }} />
          </div>
          <input className="story-hue h-4 w-full cursor-pointer appearance-none rounded-full" type="range" min={0} max={359} value={Math.round(hsv.h)}
            aria-label="Երանգ" onChange={(event) => apply({ ...hsv, h: Number(event.target.value) })} />
          <div className="flex items-center gap-2">
            <span className="size-8 shrink-0 rounded-full border border-edge" style={{ background: draft }} />
            <input className="min-h-9 min-w-0 flex-1 rounded-control border border-[var(--field-border)] bg-[var(--page-bg)] px-3 font-mono text-[13px] uppercase text-ink"
              value={draft} maxLength={7} aria-label="Գույնի կոդը (HEX)" spellCheck={false}
              onChange={(event) => {
                const next = event.target.value.startsWith("#") ? event.target.value : `#${event.target.value}`;
                setDraft(next);
                if (isHex(next)) { setHsv(hexToHsv(next)); onChange(next.toLowerCase()); }
              }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
