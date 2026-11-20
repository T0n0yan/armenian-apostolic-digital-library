import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, X } from "lucide-react";
import { Link } from "react-router";
import type { Route } from "./+types/etiquette-topic";
import { BirdLetter, KindBadge, OrnamentDivider } from "../components/etiquette-ui";
import { PageHeader, PageShell, PageTitle } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { etiquetteTopic, readyEtiquetteTopics } from "../data/etiquette";
import { breadcrumbJsonLd, seoMeta } from "../utils/seo";

export function loader({ params }: Route.LoaderArgs) {
  const topic = etiquetteTopic(params.topic);
  if (!topic || topic.status === "soon") throw new Response("Not Found", { status: 404 });
  return { slug: topic.slug };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const topic = loaderData ? etiquetteTopic(loaderData.slug) : null;
  if (!topic) return [{ title: "Վարվելակարգ — Apostolic.am" }];
  const path = `/etiquette/${topic.slug}`;
  return seoMeta({
    title: `${topic.title}. եկեղեցական վարվելակարգ — Apostolic.am`,
    description: topic.summary ?? topic.description,
    path,
    jsonLd: [breadcrumbJsonLd([{ name: "Գլխավոր", path: "/" }, { name: "Վարվելակարգ", path: "/etiquette" }, { name: topic.title, path }])],
  });
}

const sectionTitle = "m-0 flex items-center gap-3 px-1 text-[12px] font-semibold tracking-[1.6px] text-gold uppercase";
const line = <span className="h-px flex-1 bg-[linear-gradient(90deg,rgb(217_181_111/45%),transparent)]" aria-hidden="true" />;

/** Վարվելակարգի մեկ բաժին. նախ ինչպես վարվել, հետո սխալ կարծիքներ, հետո հարցեր։ */
export default function EtiquetteTopic({ loaderData }: Route.ComponentProps) {
  const topic = etiquetteTopic(loaderData.slug)!;
  const ready = readyEtiquetteTopics();
  const at = ready.findIndex((item) => item.slug === topic.slug);
  const prev = ready[at - 1];
  const next = ready[at + 1];
  const rules = topic.rules.filter((rule) => rule.kind !== "superstition");
  const myths = topic.rules.filter((rule) => rule.kind === "superstition");

  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/etiquette" backLabel="Վարվելակարգ" title="" />

      <header className="grid justify-items-center gap-1 text-center">
        <BirdLetter letter={topic.letter} className="text-[88px]" />
        <h1 className="m-0 font-noto text-[28px] leading-[34px] font-medium tracking-[-0.4px] text-balance text-ink min-[768px]:text-[38px] min-[768px]:leading-[44px]">
          <PageTitle title={topic.title} />
        </h1>
        <OrnamentDivider className="mt-1" />
        {topic.summary ? <p className="reading-body m-0 max-w-[600px] font-noto text-[16.5px] leading-[1.8] text-ink">{topic.summary}</p> : null}
        {topic.status === "review" ? <p className="m-0 mt-1 text-[12px] text-muted">⚑ Ստուգվում է հոգևորականի կողմից</p> : null}
      </header>

      {rules.length ? (
        <section className="mt-8 grid gap-3" aria-labelledby="rules">
          <h2 className={sectionTitle} id="rules">Ինչպես վարվել{line}</h2>
          <ol className="m-0 grid list-none gap-3 p-0">
            {rules.map((rule, index) => (
              <li key={rule.id} id={rule.id} className="frosted-panel hero-rise grid scroll-mt-20 grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 px-4 py-4 min-[560px]:px-5" style={{ animationDelay: `${120 + index * 60}ms` }}>
                <span className="grid size-9 place-items-center rounded-full bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] font-noto text-[15px] font-bold text-[#2a1708]" aria-hidden="true">{index + 1}</span>
                <div className="grid min-w-0 gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <h3 className="m-0 font-noto text-[18px] leading-snug font-semibold text-ink">{rule.title}</h3>
                    <KindBadge kind={rule.kind} />
                  </div>
                  <p className="reading-body m-0 text-[15px] leading-[1.75] text-ink">{rule.what}</p>
                  {rule.why ? (
                    <div className="flex gap-2.5 rounded-button bg-[rgb(217_181_111/13%)] px-3.5 py-3">
                      <BookOpen className="mt-0.5 shrink-0 text-gold" aria-hidden="true" size={17} strokeWidth={1.8} />
                      <p className="reading-body m-0 text-[14px] leading-[1.7] text-muted"><strong className="text-gold-bright">Ինչու. </strong>{rule.why}</p>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {myths.length ? (
        <section className="mt-8 grid gap-3" aria-labelledby="myths">
          <h2 className={sectionTitle} id="myths">Սխալ կարծիքներ{line}</h2>
          <div className="grid gap-3 min-[700px]:grid-cols-2">
            {myths.map((rule) => (
              <article key={rule.id} id={rule.id} className="frosted-card grid scroll-mt-20 content-start gap-0 overflow-hidden">
                <div className="flex items-start gap-2.5 bg-[rgb(178_72_63/9%)] px-4 py-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[rgb(178_72_63/16%)] text-danger" aria-hidden="true"><X size={14} strokeWidth={2.4} /></span>
                  <p className="m-0 font-noto text-[15.5px] leading-snug text-ink line-through decoration-[rgb(178_72_63/45%)] decoration-1">{rule.title}</p>
                </div>
                <div className="flex items-start gap-2.5 px-4 py-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[rgb(61_118_80/16%)] text-success" aria-hidden="true"><Check size={14} strokeWidth={2.4} /></span>
                  <p className="reading-body m-0 text-[14.5px] leading-[1.7] text-ink"><strong>Իրականում. </strong>{rule.what}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {topic.faq?.length ? (
        <section className="mt-8 grid gap-3" aria-labelledby="faq">
          <h2 className={sectionTitle} id="faq">Հաճախ հարցնում են{line}</h2>
          <div className="frosted-panel grid px-2 py-1">
            {topic.faq.map((item) => (
              <details key={item.q} className="group border-b border-glass-border last:border-b-0">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ChevronDown className="shrink-0 text-gold transition-transform group-open:rotate-180" aria-hidden="true" size={18} />
                </summary>
                <p className="reading-body m-0 px-3 pb-3 text-[15px] leading-[1.75] text-ink">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8 grid justify-items-center gap-3 rounded-panel border border-[rgb(217_181_111/35%)] bg-[linear-gradient(135deg,rgb(226_194_126/20%),rgb(125_60_86/8%))] px-5 py-6 text-center">
        <p className="m-0 max-w-[420px] font-noto text-[16px] leading-relaxed text-ink">Ձեր հարցի պատասխանը այստեղ չգտա՞ք</p>
        <Link className="inline-flex min-h-11 items-center rounded-button bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] px-6 text-[14px] font-semibold text-[#2a1708] no-underline" to="/kap">Հարցնել</Link>
      </section>

      <nav className="mt-6 grid gap-2.5 min-[560px]:grid-cols-2" aria-label="Այլ բաժիններ">
        {prev ? (
          <Link className="frosted-card flex min-h-[68px] items-center gap-3 px-4 py-2 text-inherit no-underline" to={`/etiquette/${prev.slug}`}>
            <ArrowLeft className="shrink-0 text-gold" aria-hidden="true" size={18} />
            <BirdLetter letter={prev.letter} className="text-[34px]" />
            <span className="grid"><span className="text-[11px] text-muted">Նախորդը</span><strong className="font-noto text-[15px] font-semibold">{prev.title}</strong></span>
          </Link>
        ) : <span className="hidden min-[560px]:block" />}
        {next ? (
          <Link className="frosted-card flex min-h-[68px] items-center justify-end gap-3 px-4 py-2 text-right text-inherit no-underline" to={`/etiquette/${next.slug}`}>
            <span className="grid"><span className="text-[11px] text-muted">Հաջորդը</span><strong className="font-noto text-[15px] font-semibold">{next.title}</strong></span>
            <BirdLetter letter={next.letter} className="text-[34px]" />
            <ArrowRight className="shrink-0 text-gold" aria-hidden="true" size={18} />
          </Link>
        ) : null}
      </nav>
    </PageShell>
  );
}
