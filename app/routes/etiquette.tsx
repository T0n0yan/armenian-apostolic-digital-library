import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import type { Route } from "./+types/etiquette";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { KindBadge } from "../components/etiquette-badge";
import { ETIQUETTE_TOPICS, RULE_KINDS, type RuleKind } from "../data/etiquette";
import { seoMeta } from "../utils/seo";

export function meta({}: Route.MetaArgs) {
  return seoMeta({
    title: "Եկեղեցական վարվելակարգ — Apostolic.am",
    description: "Ինչպես վարվել եկեղեցում. խաչակնքում, մոմավառություն, գլխաշոր, Պատարագի ժամանակ, հոգևորականի հետ։ Ամեն կանոնի կողքին՝ ինչու է այդպես։",
    path: "/etiquette",
  });
}

/** Վարվելակարգի բաժինները՝ Ա–Թ։ */
export default function Etiquette() {
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/" backLabel="Գրադարան" title="Վարվելակարգ" />
      <div className="mt-4 grid gap-4">
        <section className="frosted-panel grid gap-2 px-5 py-4 text-[14.5px] leading-[1.75] text-ink">
          <p className="m-0">Ինչպես մտնել եկեղեցի, մոմ վառել, կանգնել Պատարագին, դիմել քահանային։ Ամեն կանոնի կողքին գրված է, թե <strong>ինչու</strong> է այդպես։</p>
          <p className="m-0 text-[13px] text-muted">⚑ Տեքստերը դեռ ստուգվում են հոգևորականի կողմից։ Սխալ տեսնե՞լ եք՝ <Link className="text-gold-bright" to="/kap">գրեք մեզ</Link>։</p>
        </section>

        <section className="frosted-card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[13px]" aria-label="Պիտակներ">
          {(Object.keys(RULE_KINDS) as RuleKind[]).map((kind) => (
            <span key={kind} className="inline-flex items-center gap-2"><KindBadge kind={kind} /><span className="text-muted">{RULE_KINDS[kind].hint}</span></span>
          ))}
        </section>

        <ol className="m-0 grid list-none gap-2.5 p-0 min-[560px]:grid-cols-2">
          {ETIQUETTE_TOPICS.map((topic) => {
            const inner = (<>
              <span className="grid size-10 shrink-0 place-items-center rounded-control bg-[linear-gradient(145deg,rgb(214_178_112/45%),rgb(170_128_70/35%))] font-noto text-[17px] font-bold text-gold-bright" aria-hidden="true">{topic.letter}</span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <strong className="font-noto text-[16px] leading-[22px] font-semibold">{topic.title}</strong>
                <span className="text-[12.5px] leading-snug text-muted">{topic.description}</span>
              </span>
            </>);
            return (
              <li key={topic.slug}>
                {topic.status === "soon" ? (
                  <div className="frosted-card flex min-h-[76px] items-center gap-3.5 px-3.5 py-3 opacity-70">
                    {inner}
                    <span className="shrink-0 rounded-chip bg-subtle px-2 py-0.5 text-[11px] font-semibold text-muted">Շուտով</span>
                  </div>
                ) : (
                  <Link className="frosted-card flex min-h-[76px] items-center gap-3.5 px-3.5 py-3 text-inherit no-underline" to={`/etiquette/${topic.slug}`}>
                    {inner}
                    <ArrowRight className="mr-1 shrink-0 text-gold" aria-hidden="true" size={18} strokeWidth={1.8} />
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </PageShell>
  );
}
