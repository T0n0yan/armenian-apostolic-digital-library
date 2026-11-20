import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/etiquette-topic";
import { KindBadge, TopicIcon } from "../components/etiquette-ui";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { etiquetteTopic, readyEtiquetteTopics, type EtiquetteRule } from "../data/etiquette";
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

const heading = "m-0 px-1 font-noto text-[20px] font-semibold text-ink";

/** Կանոնի քարտ. «Ինչու՞»-ն բացվում է սեղմելով։ */
function RuleCard({ rule, index }: { rule: EtiquetteRule; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <li id={rule.id} className="frosted-panel hero-rise grid scroll-mt-20 gap-2.5 px-4 py-4 min-[560px]:px-5" style={{ animationDelay: `${100 + index * 60}ms` }}>
      <div className="flex items-start gap-3">
        <span className="font-noto text-[30px] leading-none font-semibold text-[rgb(176_125_46/55%)] tabular-nums" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <div className="grid min-w-0 flex-1 gap-1.5">
          <KindBadge kind={rule.kind} />
          <h3 className="m-0 font-noto text-[18px] leading-snug font-semibold text-ink">{rule.title}</h3>
        </div>
      </div>
      <p className="reading-body m-0 text-[15px] leading-[1.75] text-ink">{rule.what}</p>
      {rule.why ? (
        <>
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
            className="inline-flex min-h-10 w-fit cursor-pointer items-center gap-2 rounded-full border border-[rgb(217_181_111/45%)] bg-transparent px-4 text-[13.5px] font-semibold text-gold-bright hover:bg-[rgb(217_181_111/12%)]">
            <BookOpen aria-hidden="true" size={16} /> {open ? "Թաքցնել" : "Ինչու՞"}
            <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" size={16} />
          </button>
          {open ? <p className="etq-reveal reading-body m-0 rounded-button bg-[rgb(217_181_111/13%)] px-4 py-3 text-[14.5px] leading-[1.75] text-ink">{rule.why}</p> : null}
        </>
      ) : null}
    </li>
  );
}

/** Սնահավատություն՝ որպես հարց. ընթերցողը նախ ինքն է որոշում, հետո տեսնում պատասխանը։ */
function MythCard({ rule }: { rule: EtiquetteRule }) {
  const [answer, setAnswer] = useState<"true" | "false" | null>(null);
  const button = "inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-button border border-glass-border bg-subtle px-3 text-[14px] font-semibold text-ink hover:border-[rgb(217_181_111/55%)]";
  return (
    <article id={rule.id} className="frosted-card grid scroll-mt-20 content-start gap-3 px-4 py-4">
      <p className="m-0 text-[11px] font-bold tracking-[1.4px] text-gold uppercase">Ճի՞շտ է, թե՞ սխալ</p>
      <p className="m-0 font-noto text-[17px] leading-snug font-semibold text-ink">{rule.title}</p>
      {answer === null ? (
        <div className="flex gap-2">
          <button type="button" className={button} onClick={() => setAnswer("true")}>Ճիշտ է</button>
          <button type="button" className={button} onClick={() => setAnswer("false")}>Սխալ է</button>
        </div>
      ) : (
        <div className="etq-reveal grid gap-2">
          <p className={`m-0 flex items-center gap-2 text-[14px] font-bold ${answer === "false" ? "text-success" : "text-danger"}`}>
            <span className={`grid size-6 place-items-center rounded-full ${answer === "false" ? "bg-[rgb(61_118_80/16%)]" : "bg-[rgb(178_72_63/14%)]"}`} aria-hidden="true">
              {answer === "false" ? <Check size={14} strokeWidth={2.4} /> : <X size={14} strokeWidth={2.4} />}
            </span>
            {answer === "false" ? "Ճիշտ գտաք. սա սնահավատություն է" : "Ոչ, սա սնահավատություն է"}
          </p>
          <p className="reading-body m-0 text-[14.5px] leading-[1.7] text-ink">{rule.what}</p>
        </div>
      )}
    </article>
  );
}

/** Վարվելակարգի մեկ բաժին՝ որպես ճանապարհի մեկ կանգառ։ */
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

      <header className="relative mt-2 grid justify-items-center gap-3 overflow-hidden rounded-panel bg-[radial-gradient(ellipse_at_50%_0%,#4a2547_0%,#1e1027_60%,#120a18_100%)] px-5 pt-7 pb-6 text-center text-[#fbf6ee] shadow-[0_18px_50px_rgb(40_20_40/35%)]">
        <span className="grid size-[68px] place-items-center rounded-full border-2 border-[rgb(231_201_131/60%)] bg-[radial-gradient(circle_at_35%_30%,#fff4d8,#e2be7c)] text-[#6a4210] shadow-[0_0_40px_rgb(246_197_107/45%)]">
          <TopicIcon slug={topic.slug} size={30} />
        </span>
        <p className="m-0 text-[11px] font-bold tracking-[2px] text-[#e7c983] uppercase">Քայլ {at + 1} · {ready.length}-ից</p>
        <h1 className="m-0 font-noto text-[28px] leading-[34px] font-semibold text-balance min-[560px]:text-[36px] min-[560px]:leading-[44px]">{topic.title}</h1>
        {topic.summary ? <p className="reading-body m-0 max-w-[580px] text-[15px] leading-[1.75] text-[#e4d8ea]">{topic.summary}</p> : null}
        <nav className="mt-1 flex items-center gap-1.5" aria-label="Բոլոր քայլերը">
          {ready.map((item, index) => (
            <Link key={item.slug} to={`/etiquette/${item.slug}`} aria-label={item.title} aria-current={index === at ? "page" : undefined}
              className={`block h-2 rounded-full transition-all ${index === at ? "w-7 bg-[#f0d397]" : index < at ? "w-2 bg-[rgb(240_211_151/60%)]" : "w-2 bg-[rgb(255_255_255/22%)]"}`} />
          ))}
        </nav>
        {topic.status === "review" ? <p className="m-0 text-[11.5px] text-[#bdb0c4]">⚑ Ստուգվում է հոգևորականի կողմից</p> : null}
      </header>

      {rules.length ? (
        <section className="mt-8 grid gap-3" aria-labelledby="rules">
          <h2 className={heading} id="rules">Ինչպես վարվել</h2>
          <ol className="m-0 grid list-none gap-3 p-0">
            {rules.map((rule, index) => <RuleCard key={rule.id} rule={rule} index={index} />)}
          </ol>
        </section>
      ) : null}

      {myths.length ? (
        <section className="mt-8 grid gap-3" aria-labelledby="myths">
          <h2 className={heading} id="myths">Ստուգեք ինքներդ</h2>
          <p className="m-0 -mt-1 px-1 text-[13.5px] text-muted">Մարդկանց մեջ տարածված կարծիքներ։ Ի՞նչ եք կարծում։</p>
          <div className="grid gap-3 min-[700px]:grid-cols-2">
            {myths.map((rule) => <MythCard key={rule.id} rule={rule} />)}
          </div>
        </section>
      ) : null}

      {topic.faq?.length ? (
        <section className="mt-8 grid gap-3" aria-labelledby="faq">
          <h2 className={heading} id="faq">Հաճախ հարցնում են</h2>
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

      {next ? (
        <Link className="mt-8 flex items-center gap-4 rounded-panel bg-[radial-gradient(ellipse_at_0%_50%,#4a2547_0%,#1e1027_70%)] px-5 py-5 text-[#fbf6ee] no-underline shadow-[0_12px_36px_rgb(40_20_40/30%)]" to={`/etiquette/${next.slug}`}>
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff4d8,#e2be7c)] text-[#6a4210]"><TopicIcon slug={next.slug} /></span>
          <span className="grid min-w-0 flex-1"><span className="text-[11px] font-bold tracking-[1.6px] text-[#e7c983] uppercase">Հաջորդ քայլը</span><strong className="font-noto text-[18px] font-semibold">{next.title}</strong></span>
          <ArrowRight className="shrink-0 text-[#f0d397]" aria-hidden="true" size={22} />
        </Link>
      ) : (
        <Link className="mt-8 flex items-center justify-center gap-2 rounded-panel border border-[rgb(217_181_111/40%)] px-5 py-5 font-semibold text-gold-bright no-underline" to="/etiquette">Վերջ։ Վերադառնալ ճանապարհին</Link>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1 text-[13.5px]">
        {prev ? <Link className="inline-flex min-h-11 items-center gap-1.5 text-muted no-underline hover:text-ink" to={`/etiquette/${prev.slug}`}><ArrowLeft aria-hidden="true" size={16} />{prev.title}</Link> : <span />}
        <Link className="inline-flex min-h-11 items-center text-gold-bright no-underline" to="/kap">Հարց ունե՞ք՝ գրեք մեզ</Link>
      </div>
    </PageShell>
  );
}
