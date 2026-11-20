import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import type { Route } from "./+types/etiquette";
import { ChurchScene, KindBadge, TopicIcon } from "../components/etiquette-ui";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { ETIQUETTE_TOPICS, RULE_KINDS, type RuleKind } from "../data/etiquette";
import { seoMeta } from "../utils/seo";

export function meta({}: Route.MetaArgs) {
  return seoMeta({
    title: "Եկեղեցական վարվելակարգ — Apostolic.am",
    description: "Ինչպես վարվել եկեղեցում. խաչակնքում, մոմավառություն, գլխաշոր, Պատարագի ժամանակ, հոգևորականի հետ։ Ամեն կանոնի կողքին՝ ինչու է այդպես։",
    path: "/etiquette",
  });
}

/** Վարվելակարգ՝ որպես ճանապարհ. եկեղեցու դռնից մինչև տուն։ */
export default function Etiquette() {
  const first = ETIQUETTE_TOPICS.find((topic) => topic.status !== "soon");
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/" backLabel="Գրադարան" title="" />

      {/* Գլխանկարը միշտ մուգ է (գիշեր, մոմեր), թեմայից անկախ։ */}
      <header className="relative mt-2 overflow-hidden rounded-panel bg-[radial-gradient(ellipse_at_50%_85%,#4a2547_0%,#1e1027_55%,#120a18_100%)] text-[#fbf6ee] shadow-[0_18px_50px_rgb(40_20_40/35%)]">
        <ChurchScene className="block h-auto w-full" />
        <div className="relative mt-1 grid justify-items-center gap-3 px-5 pb-7 text-center">
          <p className="m-0 text-[11px] font-bold tracking-[2px] text-[#e7c983] uppercase">Եկեղեցական վարվելակարգ</p>
          <h1 className="m-0 max-w-[560px] font-noto text-[27px] leading-[34px] font-semibold text-balance min-[560px]:text-[36px] min-[560px]:leading-[44px]">Ինչպես վարվել Աստծո տանը</h1>
          <p className="m-0 max-w-[480px] text-[14.5px] leading-[1.7] text-[#d9cde0]">Դռնից մինչև տուն՝ քայլ առ քայլ։ Ոչ միայն «ինչ անել», այլև <strong className="text-[#fbf6ee]">ինչու</strong>։</p>
          {first ? (
            <Link className="mt-1 inline-flex min-h-12 items-center gap-2 rounded-full bg-[linear-gradient(135deg,#f0d397,#c08a35)] px-6 text-[15px] font-semibold text-[#2a1708] no-underline shadow-[0_8px_24px_rgb(240_190_100/30%)]" to={`/etiquette/${first.slug}`}>
              Սկսել դռնից <ArrowRight aria-hidden="true" size={18} />
            </Link>
          ) : null}
        </div>
      </header>

      <section className="mt-8 grid gap-1" aria-labelledby="etq-path">
        <h2 className="m-0 mb-3 px-1 font-noto text-[20px] font-semibold text-ink" id="etq-path">Ճանապարհը</h2>
        <ol className="relative m-0 grid list-none gap-3 p-0 before:absolute before:top-6 before:bottom-6 before:left-[25px] before:w-0 before:border-l-2 before:border-dashed before:border-[rgb(217_181_111/45%)] before:content-['']">
          {ETIQUETTE_TOPICS.map((topic, index) => {
            const soon = topic.status === "soon";
            const body = (<>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <strong className="font-noto text-[16.5px] leading-[23px] font-semibold text-ink">{topic.title}</strong>
                  <span className="text-[11.5px] font-semibold text-gold">{soon ? "Շուտով" : `${topic.rules.length} կանոն`}</span>
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">{topic.description}</span>
              </span>
              {soon ? null : <ArrowRight className="shrink-0 text-gold" aria-hidden="true" size={18} strokeWidth={1.8} />}
            </>);
            return (
              <li key={topic.slug} className="hero-rise relative flex items-center gap-3" style={{ animationDelay: `${150 + index * 60}ms` }}>
                <span className={`relative z-1 grid size-[52px] shrink-0 place-items-center rounded-full border-2 ${soon ? "border-glass-border bg-subtle text-faint" : "border-[rgb(217_181_111/60%)] bg-[radial-gradient(circle_at_35%_30%,#fff4d8,#ecd3a0)] text-[#7a5010] shadow-[0_4px_14px_rgb(176_125_46/25%)]"}`}>
                  <TopicIcon slug={topic.slug} />
                </span>
                {soon
                  ? <div className="frosted-card flex min-h-[72px] flex-1 items-center gap-3 px-4 py-3 opacity-60">{body}</div>
                  : <Link className="frosted-card flex min-h-[72px] flex-1 items-center gap-3 px-4 py-3 text-inherit no-underline" to={`/etiquette/${topic.slug}`}>{body}</Link>}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="frosted-card mt-8 grid gap-2 px-4 py-3.5" aria-label="Ինչպես կարդալ պիտակները">
        {(Object.keys(RULE_KINDS) as RuleKind[]).map((kind) => (
          <div key={kind} className="flex flex-wrap items-center gap-2">
            <KindBadge kind={kind} />
            <span className="text-[13px] leading-snug text-muted">{RULE_KINDS[kind].hint}</span>
          </div>
        ))}
      </section>

      <p className="mx-auto mt-6 mb-0 max-w-[520px] text-center text-[12.5px] leading-relaxed text-muted">
        ⚑ Տեքստերը դեռ ստուգվում են հոգևորականի կողմից։ Սխալ տեսնե՞լ եք՝ <Link className="text-gold-bright" to="/kap">գրեք մեզ</Link>։
      </p>
    </PageShell>
  );
}
