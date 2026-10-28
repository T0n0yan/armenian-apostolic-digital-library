import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { placeMatches } from "../utils/places";

// Rows and blocks of the page a search narrows down: list rows inside sections (or anything marked).
const GROUPS = "main section, main [data-find-group]";
const ITEMS = "main section li, main [data-find]";

const matches = (element: Element, query: string) => placeMatches({ name: element.textContent ?? "", region: "" }, query);

/**
 * The header's search on a page of its own (settings, admin pages, a place): it narrows this page
 * to the blocks and rows that have the words, in Armenian or Latin letters. Nothing leaves the page.
 */
export function PageFind({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const groups = [...document.querySelectorAll<HTMLElement>(GROUPS)].filter((group) => !group.closest("[data-find-skip]"));
    const items = [...document.querySelectorAll<HTMLElement>(ITEMS)];
    const reset = () => { for (const element of [...groups, ...items]) element.hidden = false; };
    const typed = query.trim();
    if (!typed) { reset(); setFound(null); return reset; }
    // A row shows when it has the words; a block when its own text does (title, settings) or a row in it does.
    for (const item of items) item.hidden = !matches(item, typed);
    let count = 0;
    for (const group of groups) {
      const rows = items.filter((item) => group.contains(item) && item.closest(GROUPS) === group);
      const visibleRow = rows.some((item) => !item.hidden);
      // Words outside the rows (a title, a setting): the whole block shows.
      const ownMatch = !visibleRow && matches(group, typed);
      group.hidden = !visibleRow && !ownMatch;
      if (ownMatch) for (const item of rows) item.hidden = false;
      if (!group.hidden) count += 1;
    }
    setFound(count);
    document.querySelector<HTMLElement>(`${GROUPS.split(", ").map((selector) => `${selector}:not([hidden])`).join(", ")}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return reset;
  }, [query]);
  return (
    <div className="mx-auto mt-2 mb-3 grid w-full max-w-[560px] gap-1" data-find-skip>
      <div className="flex items-center gap-2 rounded-[16px] border border-[rgb(217_181_111/45%)] bg-subtle px-3 motion-safe:animate-[glass-enter_200ms_ease-out]">
        <Search aria-hidden="true" size={17} className="shrink-0 text-gold-bright" />
        <input ref={input} className="min-h-12 min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint" type="search" enterKeyHint="search"
          value={query} onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Escape") onClose(); if (event.key === "Enter") event.currentTarget.blur(); }}
          placeholder="Փնտրել այս էջում…" aria-label="Փնտրել այս էջում" />
        <button type="button" onClick={onClose} aria-label="Փակել որոնումը" className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-faint hover:text-ink"><X aria-hidden="true" size={17} /></button>
      </div>
      {found === 0 ? <p className="m-0 text-center text-[12.5px] text-muted" role="status">Այս էջում «{query.trim()}» չգտնվեց։</p> : null}
    </div>
  );
}
