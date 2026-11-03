import { BookOpenCheck, Check, Headphones, LoaderCircle, MonitorPlay } from "lucide-react";
import { useEffect, useState } from "react";

import { localDay } from "../utils/local-day";

export type ReadKind = "read" | "listen" | "watch";

const TEXT: Record<ReadKind, { mark: string; done: string; icon: typeof Check }> = {
  read: { mark: "Կարդացել եմ", done: "Այսօր կարդացել եք", icon: BookOpenCheck },
  listen: { mark: "Լսել եմ", done: "Այսօր լսել եք", icon: Headphones },
  watch: { mark: "Դիտել եմ", done: "Այսօր դիտել եք", icon: MonitorPlay },
};

/** What finishing this material means: watching a video, listening to a recording, or reading. */
export function readKindFor(media: Array<{ kind: string }>): ReadKind {
  if (media.some((asset) => asset.kind === "video" || asset.kind === "animation")) return "watch";
  if (media.some((asset) => asset.kind === "audio" || asset.kind === "voice")) return "listen";
  return "read";
}

/**
 * The reader marks a material as read, listened to or watched today; the day lights up in the
 * reading calendar («Իմ անկյունը») with this material listed under it. Tapping again unmarks it.
 */
export function ReadMark({ materialId, kind, marks }: { materialId: string; kind: ReadKind; marks: Array<{ day: string; kind: string }> }) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const today = localDay(); setDone(marks.some((mark) => mark.day === today)); }, [marks]);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const next = !done;
    const response = await fetch("/api/reading-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ materialId, day: localDay(), kind, remove: !next }),
    }).catch(() => null);
    if (response?.ok) {
      setDone(next);
      if (next) navigator.vibrate?.(18);
    }
    setBusy(false);
  };

  const { mark, done: doneText, icon: Icon } = TEXT[kind];
  return (
    <button
      className={`read-mark flex min-h-[58px] w-full cursor-pointer items-center justify-center gap-3 rounded-[16px] border px-4 py-2 text-[15.5px] font-bold transition-[background,border-color,transform,translate,scale,color,box-shadow] duration-200 active:scale-[.97] ${done ? "is-done" : "action-tile"}`}
      type="button"
      onClick={toggle}
      aria-pressed={done}
      aria-busy={busy}
    >
      {busy ? <LoaderCircle className="animate-search-spin" aria-hidden="true" size={21} /> : done ? <Check aria-hidden="true" size={21} strokeWidth={2.4} /> : <Icon aria-hidden="true" size={21} strokeWidth={1.9} />}
      {/* Տակի փոքր տողը բացատրում է, թե ինչ կլինի սեղմելիս։ */}
      <span className="flex flex-col items-start leading-tight">
        <span>{done ? doneText : mark}</span>
        <span className="text-[11.5px] font-semibold opacity-80">{done ? "Սեղմեք՝ չեղարկելու" : "Սեղմեք՝ նշելու օրացույցում"}</span>
      </span>
    </button>
  );
}
