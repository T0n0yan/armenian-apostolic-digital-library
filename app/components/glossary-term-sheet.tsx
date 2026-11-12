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
    <BottomSheet open={word !== null} onClose={onClose} label="Ավելացնել բառարանում">
      <div className="grid max-h-[80svh] gap-3 overflow-y-auto p-1">
        <h2 className="m-0 font-sans text-[15px] font-bold text-ink">Ավելացնել բառարանում</h2>
        {word !== null ? <TermForm key={word} word={word} fetcher={fetcher} error={result?.error} onDone={onClose} /> : null}
      </div>
    </BottomSheet>
  );
}
