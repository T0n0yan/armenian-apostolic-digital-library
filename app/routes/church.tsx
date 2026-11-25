import { ChevronRight } from "lucide-react";
import { useRef } from "react";
import { Link, useSearchParams } from "react-router";
import { ChurchSearchField, ChurchSearchResults } from "../components/church-search";
import type { Route } from "./+types/church";
import { card, ChurchIcon, groupTitle } from "../components/etiquette-ui";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { CHURCH_SECTIONS, CHURCH_SUBTITLE, CHURCH_TITLE, churchSectionPath } from "../data/church";
import { seoMeta } from "../utils/seo";

export function meta({}: Route.MetaArgs) {
  return seoMeta({ title: `${CHURCH_TITLE} — Apostolic.am`, description: `${CHURCH_SUBTITLE}՝ պարզ և կարճ։`, path: "/church" });
}

const row = "flex min-h-[64px] items-center gap-3.5 px-4 py-3 text-inherit no-underline";
const divider = "border-t border-[rgb(150_110_50/14%)]";

/** «Կարգեր և վարքեր»՝ ենթաբաժինների ցուցակ։ */
export default function Church() {
  const ready = CHURCH_SECTIONS.filter((section) => section.status !== "soon");
  const soon = CHURCH_SECTIONS.filter((section) => section.status === "soon");
  const input = useRef<HTMLInputElement>(null);
  const query = (useSearchParams()[0].get("q") ?? "").trim();
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/" backLabel="Գրադարան" title="" onSearch={() => input.current?.focus()} />
      <header className="mt-2 grid gap-1.5 px-1">
        <h1 className="m-0 font-noto text-[30px] leading-[38px] font-semibold tracking-[-0.3px] text-ink min-[560px]:text-[36px] min-[560px]:leading-[44px]">{CHURCH_TITLE}</h1>
        <p className="m-0 text-[14.5px] leading-[1.6] text-muted">{CHURCH_SUBTITLE}</p>
      </header>
      <ChurchSearchField ref={input} />

      {query ? <ChurchSearchResults query={query} /> : (<>
      <section className="mt-6 grid gap-2" aria-labelledby="church-ready">
        <h2 className={groupTitle} id="church-ready">Բաժիններ</h2>
        <ul className={`${card} m-0 list-none p-0`}>
          {ready.map((section, index) => (
            <li key={section.slug} className={index ? divider : ""}>
              <Link className={row} to={churchSectionPath(section)}>
                <span className="grid size-10 shrink-0 place-items-center rounded-control bg-[rgb(176_125_46/14%)] text-gold-bright"><ChurchIcon slug={section.slug} /></span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <strong className="text-[16px] leading-snug font-semibold text-ink">{section.title}</strong>
                  <span className="text-[13px] leading-snug text-muted">{section.description}</span>
                </span>
                <ChevronRight className="shrink-0 text-faint" aria-hidden="true" size={18} />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {soon.length ? (
        <section className="mt-6 grid gap-2" aria-labelledby="church-soon">
          <h2 className={groupTitle} id="church-soon">Շուտով կավելանան</h2>
          <ul className={`${card} m-0 list-none p-0 opacity-75`}>
            {soon.map((section, index) => (
              <li key={section.slug} className={`flex min-h-[60px] items-center gap-3.5 px-4 py-3 ${index ? divider : ""}`}>
                <span className="grid size-10 shrink-0 place-items-center rounded-control bg-subtle text-faint"><ChurchIcon slug={section.slug} /></span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-[15.5px] font-semibold text-muted">{section.title}</span>
                  <span className="text-[12.5px] leading-snug text-faint">{section.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      </>)}

      <p className="mx-auto mt-7 mb-0 max-w-[560px] text-center text-[12.5px] leading-relaxed text-muted">
        Այս բաժինը հիմնված է Հայ Առաքելական Եկեղեցու հոգևորականների գրքերի վրա։ Ձեր կոնկրետ դեպքի համար դիմեք ձեր ծխի քահանային։
      </p>
    </PageShell>
  );
}
