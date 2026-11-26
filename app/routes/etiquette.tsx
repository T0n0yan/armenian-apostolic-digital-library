import { ChevronRight, Search, X } from "lucide-react";
import { useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/etiquette";
import { card, groupTitle, TopicIcon } from "../components/etiquette-ui";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { ETIQUETTE_INTRO, ETIQUETTE_TOPICS, POPULAR_QUESTIONS } from "../data/etiquette";
import { searchEtiquette } from "../utils/etiquette-search";
import { CHURCH_TITLE } from "../data/church";
import { seoMeta } from "../utils/seo";

export function meta({}: Route.MetaArgs) {
  return seoMeta({
    title: "Վարք եկեղեցում — Apostolic.am",
    description: "Ինչպես վարվել եկեղեցում. խաչակնքում, մոմավառություն, գլխաշոր, Պատարագի ժամանակ, հոգևորականի հետ։ Ամեն կանոնի կողքին՝ ինչու է այդպես։",
    path: "/church/etiquette",
  });
}

const row = "flex min-h-[60px] items-center gap-3.5 px-4 py-2.5 text-inherit no-underline";
const divider = "border-t border-[rgb(150_110_50/14%)]";

/** «Վարք եկեղեցում»՝ որոնում, հաճախ տրվող հարցեր, բաժիններ, շուտով ավելացողները։ */
export default function Etiquette() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => (query.trim() ? searchEtiquette(query) : []), [query]);
  const ready = ETIQUETTE_TOPICS.filter((topic) => topic.status !== "soon");
  const soon = ETIQUETTE_TOPICS.filter((topic) => topic.status === "soon");
  const setQuery = (value: string) => setParams(value ? { q: value } : {}, { replace: true, preventScrollReset: true });

  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/church" backLabel={CHURCH_TITLE} title="" onSearch={() => input.current?.focus()} />

      <header className="mt-2 grid gap-1.5 px-1">
        <h1 className="m-0 font-noto text-[30px] leading-[38px] font-semibold tracking-[-0.3px] text-ink min-[560px]:text-[36px] min-[560px]:leading-[44px]">Վարք եկեղեցում</h1>
        <p className="m-0 text-[14.5px] leading-[1.6] text-muted">{ETIQUETTE_INTRO}</p>
      </header>

      <label className="search-field mt-5 flex min-h-[52px] items-center gap-2.5 pr-2 pl-4">
        <Search aria-hidden="true" size={18} className="shrink-0 text-muted" />
        <span className="sr-only">Փնտրել վարքի կանոններում</span>
        <input ref={input} className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint" type="search" enterKeyHint="search"
          value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Օրինակ՝ գլխաշոր, մոմ, քահանա" />
        {query ? <button type="button" className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-faint hover:text-ink" onClick={() => setQuery("")} aria-label="Մաքրել"><X aria-hidden="true" size={17} /></button> : null}
      </label>

      {query.trim() ? (
        <section className="mt-5 grid gap-2" aria-live="polite" aria-labelledby="etq-found">
          <h2 className={groupTitle} id="etq-found">{hits.length ? `Գտնվեց՝ ${hits.length}` : "Ոչինչ չգտնվեց"}</h2>
          {hits.length ? (
            <ul className={`${card} m-0 list-none p-0`}>
              {hits.map((hit, index) => (
                <li key={hit.href} className={index ? divider : ""}>
                  <Link className={`${row} items-start py-3`} to={hit.href}>
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
              Այս հարցի պատասխանը դեռ չունենք։ <Link className="font-semibold text-gold-bright" to="/kap">Գրեք մեզ</Link>, և այն կավելացնենք։
            </p>
          )}
        </section>
      ) : (
        <>
          
          <section className="mt-5 grid gap-2" aria-labelledby="etq-topics">
            <h2 className={groupTitle} id="etq-topics">Բաժիններ</h2>
            <ul className={`${card} m-0 list-none p-0`}>
              {ready.map((topic, index) => (
                <li key={topic.slug} className={index ? divider : ""}>
                  <Link className={row} to={`/church/etiquette/${topic.slug}`}>
                    <span className="grid size-9 shrink-0 place-items-center rounded-control bg-[rgb(176_125_46/14%)] text-gold-bright"><TopicIcon slug={topic.slug} size={19} /></span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <strong className="text-[15.5px] leading-snug font-semibold text-ink">{topic.title}</strong>
                      <span className="text-[13px] leading-snug text-muted">{topic.description} <span className="whitespace-nowrap text-faint">· {topic.rules.length} կանոն</span></span>
                    </span>
                                        <ChevronRight className="shrink-0 text-faint" aria-hidden="true" size={18} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 grid gap-2" aria-labelledby="etq-popular">
            <h2 className={groupTitle} id="etq-popular">Հաճախ հարցնում են</h2>
            <ul className={`${card} m-0 list-none p-0`}>
              {POPULAR_QUESTIONS.map(([question, slug, id], index) => (
                <li key={question} className={index ? divider : ""}>
                  <Link className={`${row} min-h-[52px]`} to={`/church/etiquette/${slug}#${id}`}>
                    <span className="flex-1 text-[15px] font-medium text-ink">{question}</span>
                    <ChevronRight className="shrink-0 text-faint" aria-hidden="true" size={18} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {soon.length ? (
            <section className="mt-6 grid gap-2" aria-labelledby="etq-soon">
              <h2 className={groupTitle} id="etq-soon">Շուտով կավելանան</h2>
              <ul className={`${card} m-0 list-none p-0 opacity-75`}>
                {soon.map((topic, index) => (
                  <li key={topic.slug} className={`flex min-h-[56px] items-center gap-3.5 px-4 py-2.5 ${index ? divider : ""}`}>
                    <span className="grid size-9 shrink-0 place-items-center rounded-control bg-subtle text-faint"><TopicIcon slug={topic.slug} size={19} /></span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="text-[15px] font-semibold text-muted">{topic.title}</span>
                      <span className="text-[12.5px] leading-snug text-faint">{topic.description}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

        </>
      )}

      <p className="mx-auto mt-6 mb-0 max-w-[520px] text-center text-[12.5px] leading-relaxed text-muted">
        Այս բաժինը հիմնված է Հայ Առաքելական Եկեղեցու հոգևորականների գրքերի վրա։ Ձեր կոնկրետ դեպքի համար դիմեք ձեր ծխի քահանային։ Հարց ունե՞ք՝ <Link className="text-gold-bright" to="/kap">գրեք մեզ</Link>։
      </p>
    </PageShell>
  );
}
