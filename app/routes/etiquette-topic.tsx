import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "react-router";
import type { Route } from "./+types/etiquette-topic";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { etiquetteTopic, readyEtiquetteTopics } from "../data/etiquette";
import { breadcrumbJsonLd, seoMeta } from "../utils/seo";
import { KindBadge } from "../components/etiquette-badge";

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

const chip = "inline-flex min-h-9 items-center rounded-full border border-glass-border bg-subtle px-3.5 text-[13px] text-ink no-underline hover:text-gold-bright";
const label = "text-[11px] font-bold tracking-[1.2px] text-gold uppercase";

/** Վարվելակարգի մեկ բաժին՝ ամփոփում, կանոնների քարտեր, հարցեր։ */
export default function EtiquetteTopic({ loaderData }: Route.ComponentProps) {
  const topic = etiquetteTopic(loaderData.slug)!;
  const ready = readyEtiquetteTopics();
  const at = ready.findIndex((item) => item.slug === topic.slug);
  const prev = ready[at - 1];
  const next = ready[at + 1];
  const related = (topic.related ?? []).map(etiquetteTopic).filter((item) => item && item.status !== "soon");

  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/etiquette" backLabel="Վարվելակարգ" title={topic.title} />
      <article className="mt-4 grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={label}>Վարվելակարգ · {topic.letter}</span>
          {topic.status === "review" ? <span className="rounded-chip bg-[rgb(125_60_86/14%)] px-2.5 py-0.5 text-[12px] font-bold text-muted">⚑ Ստուգման մեջ</span> : null}
        </div>

        {topic.summary ? (
          <section className="rounded-card border border-[rgb(217_181_111/35%)] bg-[linear-gradient(135deg,rgb(226_194_126/26%),rgb(176_125_46/12%))] px-5 py-4">
            <h2 className={`${label} m-0 mb-1.5`}>Կարճ</h2>
            <p className="reading-body m-0 text-[15.5px] leading-[1.75] text-ink">{topic.summary}</p>
          </section>
        ) : null}

        <nav className="flex flex-wrap gap-1.5" aria-label="Այս էջում">
          {topic.rules.map((rule) => <a key={rule.id} className={chip} href={`#${rule.id}`}>{rule.title}</a>)}
          {topic.faq?.length ? <a className={chip} href="#faq">Հաճախ հարցնում են</a> : null}
        </nav>

        {topic.rules.map((rule) => (
          <section key={rule.id} id={rule.id} className="frosted-panel grid scroll-mt-20 gap-2.5 px-5 py-4">
            <KindBadge kind={rule.kind} />
            <h2 className="m-0 font-noto text-[18px] leading-snug font-semibold text-ink">{rule.title}</h2>
            <div className="grid gap-1">
              {rule.kind === "superstition" ? <h3 className={`${label} m-0`}>Իրականում</h3> : <h3 className={`${label} m-0`}>Ինչ անել</h3>}
              <p className="reading-body m-0 text-[15px] leading-[1.75] text-ink">{rule.what}</p>
            </div>
            {rule.why ? (
              <div className="grid gap-1">
                <h3 className={`${label} m-0`}>Ինչու</h3>
                <p className="reading-body m-0 text-[15px] leading-[1.75] text-ink">{rule.why}</p>
              </div>
            ) : null}
          </section>
        ))}

        {topic.faq?.length ? (
          <section id="faq" className="frosted-panel grid scroll-mt-20 gap-1 px-5 py-4">
            <h2 className="m-0 mb-1 font-noto text-[17px] font-semibold text-gold-bright">Հաճախ հարցնում են</h2>
            {topic.faq.map((item) => (
              <details key={item.q} className="border-b border-glass-border py-2 last:border-b-0">
                <summary className="min-h-9 cursor-pointer py-1.5 text-[15px] font-semibold text-ink">{item.q}</summary>
                <p className="reading-body m-0 pb-2 text-[15px] leading-[1.75] text-ink">{item.a}</p>
              </details>
            ))}
          </section>
        ) : null}

        {related.length ? (
          <section className="grid gap-2">
            <h2 className={`${label} m-0`}>Կապված թեմաներ</h2>
            <div className="flex flex-wrap gap-1.5">
              {related.map((item) => <Link key={item!.slug} className={chip} to={`/etiquette/${item!.slug}`}>{item!.title}</Link>)}
            </div>
          </section>
        ) : null}

        <section className="flex flex-wrap items-center gap-3 rounded-card border border-dashed border-[rgb(217_181_111/45%)] px-5 py-4">
          <p className="m-0 flex-[1_1_260px] text-[14.5px] leading-relaxed text-ink">Ձեր հարցը այստեղ չկա՞։ Գրեք մեզ, պատասխանը կավելացնենք այս էջում։</p>
          <Link className="inline-flex min-h-11 items-center rounded-button bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] px-5 text-[14px] font-semibold text-[#2a1708] no-underline" to="/kap">Հարցնել</Link>
        </section>

        <nav className="flex flex-wrap justify-between gap-2" aria-label="Այլ բաժիններ">
          {prev ? <Link className={`${chip} min-h-11 gap-1.5`} to={`/etiquette/${prev.slug}`}><ArrowLeft aria-hidden="true" size={16} />{prev.title}</Link> : <span />}
          {next ? <Link className={`${chip} min-h-11 gap-1.5`} to={`/etiquette/${next.slug}`}>{next.title}<ArrowRight aria-hidden="true" size={16} /></Link> : null}
        </nav>
      </article>
    </PageShell>
  );
}
