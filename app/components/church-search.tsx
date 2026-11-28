import { ChevronRight, Search, X } from "lucide-react";
import { forwardRef, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { EtiquetteHit } from "../utils/etiquette-search";
import { card, groupTitle } from "./etiquette-ui";
import { ASK_URL } from "../utils/questions";

/** «Կարգեր և վարքեր»-ի որոնման դաշտը (հարցումը՝ ?q=)։ */
export const ChurchSearchField = forwardRef<HTMLInputElement>(function ChurchSearchField(_, ref) {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const setQuery = (value: string) => setParams(value ? { q: value } : {}, { replace: true, preventScrollReset: true });
  return (
    <label className="search-field mt-5 flex min-h-[52px] items-center gap-2.5 pr-2 pl-4">
      <Search aria-hidden="true" size={18} className="shrink-0 text-muted" />
      <span className="sr-only">Փնտրել կարգերում և վարքերում</span>
      <input ref={ref} className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint" type="search" enterKeyHint="search"
        value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Օրինակ՝ քառասունք, գլխաշոր, մոմ" />
      {query ? <button type="button" className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-faint hover:text-ink" onClick={() => setQuery("")} aria-label="Մաքրել"><X aria-hidden="true" size={17} /></button> : null}
    </label>
  );
});

/** Արդյունքները՝ բոլոր ենթաբաժիններից։ */
/** Որոնումը սերվերում է (ուղեցույցները բազայում են)։ null՝ դեռ բեռնվում է։ */
export function useChurchSearch(query: string, limit = 20, record = false) {
  const [hits, setHits] = useState<EtiquetteHit[] | null>(null);
  useEffect(() => {
    if (!query.trim()) { setHits([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/church-search?q=${encodeURIComponent(query)}&limit=${limit}${record ? "&record=1" : ""}`, { signal: controller.signal })
        .then((response) => response.json() as Promise<{ hits: EtiquetteHit[] }>)
        .then((data) => setHits(data.hits))
        .catch(() => { if (!controller.signal.aborted) setHits([]); });
    }, record ? 700 : 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, limit, record]);
  return hits;
}

export function ChurchSearchResults({ query }: { query: string }) {
  const hits = useChurchSearch(query, 20, true);
  if (!hits) return <p className="mt-5 mb-0 px-1 text-[13px] text-muted" aria-live="polite">Փնտրում ենք…</p>;
  return (
    <section className="mt-5 grid gap-2" aria-live="polite" aria-labelledby="church-found">
      <h2 className={groupTitle} id="church-found">{hits.length ? `Գտնվեց՝ ${hits.length}` : "Ոչինչ չգտնվեց"}</h2>
      {hits.length ? (
        <ul className={`${card} m-0 list-none p-0`}>
          {hits.map((hit, index) => (
            <li key={hit.href} className={index ? "border-t border-[rgb(150_110_50/14%)]" : ""}>
              <Link className="flex items-start gap-3.5 px-4 py-3 text-inherit no-underline" to={hit.href}>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-[11.5px] font-semibold text-gold">{hit.topic}</span>
                  <strong className="font-noto text-[15.5px] leading-snug font-semibold text-ink">{hit.title}</strong>
                  <span className="line-clamp-2 text-[13px] leading-snug text-muted">{hit.text}</span>
                </span>
                <ChevronRight className="mt-6 shrink-0 text-faint" aria-hidden="true" size={18} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${card} m-0 px-4 py-4 text-[14px] leading-relaxed text-ink`}>
          Չգտա՞ք։ <a className="font-semibold text-gold-bright" href={ASK_URL} target="_blank" rel="noreferrer">Հարցրեք մեզ Telegram-ով</a>, և պատասխանը կավելացնենք։
        </p>
      )}
    </section>
  );
}
