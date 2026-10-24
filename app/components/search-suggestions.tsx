import { Search } from "lucide-react";
import { useEffect, useMemo, useState, type RefObject } from "react";

import { normalizeTelegramSearchText, searchAliases } from "../../shared/telegram-search";
import { foreignSuggestions, indexSuggestionTerms, loadSearchIndex } from "../utils/local-search";

const MAX_SUGGESTIONS = 6;
let termsPromise: Promise<string[]> | null = null;

/**
 * Suggestion terms: the sections, common words and every title, from the title index the phone
 * keeps (no request once it has it); the server's list only when the index can't be had.
 */
function loadTerms() {
  termsPromise ??= loadSearchIndex()
    .then((index) => index ? indexSuggestionTerms(index.index) : fetch("/api/search-suggestions")
      .then((response) => response.ok ? response.json() as Promise<{ terms: string[] }> : { terms: [] })
      .then((data) => data.terms))
    .then((terms) => terms.map((term) => term.trim()).filter(Boolean))
    .catch(() => { termsPromise = null; return []; });
  return termsPromise;
}

// Latin letters that stand for more than one Armenian letter ("t" is տ or թ, "p" պ or փ…).
const AMBIGUOUS: Array<[string, string]> = [["տ", "թ"], ["պ", "փ"], ["կ", "ք"], ["ր", "ռ"], ["ե", "է"], ["ո", "օ"], ["չ", "ճ"], ["ց", "ծ"]];

function latinVariants(query: string) {
  const variants = new Set([query, ...searchAliases(query)]);
  for (const alias of [...variants]) {
    if (!/\p{Script=Armenian}/u.test(alias)) continue;
    for (const [from, to] of AMBIGUOUS) if (alias.includes(from)) variants.add(alias.replaceAll(from, to));
  }
  return [...variants].slice(0, 16);
}

/**
 * Terms whose words start with what was typed; whole-term prefixes first, then shorter terms.
 * Latin typing ("sax", "aghot") is matched through its Armenian spelling, so the suggestions stay
 * in Armenian.
 */
function rank(terms: string[], typed: string) {
  const query = normalizeTelegramSearchText(typed);
  if (!query) return [];
  const variants = /\p{Script=Latin}/u.test(query) ? latinVariants(query) : [query];
  const scored: Array<{ term: string; score: number }> = [];
  for (const term of terms) {
    const normalized = normalizeTelegramSearchText(term);
    if (!normalized || variants.includes(normalized)) continue;
    let score = -1;
    for (const variant of variants) {
      const s = normalized.startsWith(variant) ? 0 : ` ${normalized}`.includes(` ${variant}`) ? 1 : -1;
      if (s >= 0 && (score < 0 || s < score)) score = s;
    }
    if (score >= 0) scored.push({ term, score });
  }
  return scored
    .sort((left, right) => left.score - right.score || left.term.length - right.term.length)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ term }) => term);
}

/**
 * A Google-style list under a search box: terms and material titles that match what is being
 * typed. Choosing one fills the box and searches right away.
 */
export function SearchSuggestions({ inputRef, onPick }: { inputRef: RefObject<HTMLInputElement | null>; onPick: (term: string) => void }) {
  const [terms, setTerms] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // English or Russian typing ("prayer", "молитва") suggests the Armenian word it means.
  const suggestions = useMemo(() => [...new Set([...foreignSuggestions(typed), ...rank(terms, typed)])].slice(0, MAX_SUGGESTIONS), [terms, typed]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onFocus = () => { void loadTerms().then(setTerms); setTyped(input.value); setOpen(true); };
    const onInput = () => { setTyped(input.value); setOpen(true); setActive(-1); };
    // Let a tap on a suggestion land before the list closes.
    const onBlur = () => window.setTimeout(() => setOpen(false), 160);
    input.addEventListener("focus", onFocus);
    input.addEventListener("input", onInput);
    input.addEventListener("blur", onBlur);
    if (document.activeElement === input) onFocus();
    return () => {
      input.removeEventListener("focus", onFocus);
      input.removeEventListener("input", onInput);
      input.removeEventListener("blur", onBlur);
    };
  }, [inputRef]);

  const visible = open && suggestions.length > 0;
  useEffect(() => {
    const input = inputRef.current;
    if (!input || !visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => (index + 1) % suggestions.length); }
      else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => (index <= 0 ? suggestions.length : index) - 1); }
      else if (event.key === "Escape") setOpen(false);
      else if (event.key === "Enter" && active >= 0) { event.preventDefault(); pick(suggestions[active]); }
    };
    input.addEventListener("keydown", onKey);
    return () => input.removeEventListener("keydown", onKey);
  });

  function pick(term: string) {
    const input = inputRef.current;
    if (input) input.value = term;
    setTyped(term);
    setOpen(false);
    onPick(term);
  }

  if (!visible) return null;
  return (
    <ul className="search-suggestions absolute inset-x-0 top-[calc(100%+6px)] z-30 m-0 grid list-none gap-0.5 overflow-hidden rounded-[16px] border border-glass-border bg-[var(--page-bg)] p-1.5 text-left shadow-[0_18px_44px_rgb(40_20_10/22%)]" role="listbox" aria-label="Հուշումներ">
      {suggestions.map((term, index) => (
        <li key={term} role="option" aria-selected={index === active}>
          <button
            className={`flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-[11px] border-0 bg-transparent px-3 text-left text-[14.5px] text-ink hover:bg-subtle ${index === active ? "bg-subtle" : ""}`}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(term)}
          >
            <Search aria-hidden="true" size={15} className="shrink-0 text-faint" />
            <span className="line-clamp-1">{term}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
