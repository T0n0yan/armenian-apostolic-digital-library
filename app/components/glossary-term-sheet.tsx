import { BookPlus, X } from "lucide-react";
import { useEffect } from "react";
import { useFetcher } from "react-router";

import { BottomSheet } from "./bottom-sheet";
import { TermForm } from "./glossary-term-form";

/** Ադմինը տեքստում սեղմած բառը ավելացնում է բառարանում՝ նույն ձևով, ինչ «Բառարան» էջում։ */
export function GlossaryTermSheet({ word, onClose }: { word: string | null; onClose: () => void }) {
  const fetcher = useFetcher();
  const result = fetcher.data as { ok?: true; error?: string } | undefined;
  useEffect(() => {
    if (fetcher.state === "idle" && result?.ok) onClose();
  }, [fetcher.state, result, onClose]);
  return (
    <BottomSheet open={word !== null} onClose={onClose} label="Ավելացնել բառարանում" className="glossary-sheet gap-3 p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[rgb(217_181_111/16%)] text-gold-bright"><BookPlus aria-hidden="true" size={18} /></span>
        <h2 className="m-0 min-w-0 flex-1 font-sans text-[16px] font-bold text-ink">Ավելացնել բառարանում</h2>
        <button className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-subtle text-muted" type="button" onClick={onClose} aria-label="Փակել"><X aria-hidden="true" size={17} /></button>
      </div>
      {word !== null ? <TermForm key={word} word={word} fetcher={fetcher} error={result?.error} onDone={onClose} /> : null}
    </BottomSheet>
  );
}
