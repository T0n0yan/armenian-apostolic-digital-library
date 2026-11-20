import { Check, ChevronDown, ChevronRight, X } from "lucide-react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/etiquette-topic";
import { card, groupTitle, TopicIcon } from "../components/etiquette-ui";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { ETIQUETTE_TOPICS, RULE_KINDS, etiquetteTopic } from "../data/etiquette";
import { breadcrumbJsonLd, seoMeta } from "../utils/seo";

export function loader({ params }: Route.LoaderArgs) {
  const topic = etiquetteTopic(params.topic);
  if (!topic || topic.status === "soon") throw new Response("Not Found", { status: 404 });
  return { slug: topic.slug };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const topic = loaderData ? etiquetteTopic(loaderData.slug) : null;
  if (!topic) return [{ title: "Վարք եկեղեցում — Apostolic.am" }];
  const path = `/etiquette/${topic.slug}`;
  return seoMeta({
    title: `${topic.title}. վարք եկեղեցում — Apostolic.am`,
    description: topic.summary ?? topic.description,
    path,
    jsonLd: [breadcrumbJsonLd([{ name: "Գլխավոր", path: "/" }, { name: "Վարք եկեղեցում", path: "/etiquette" }, { name: topic.title, path }])],
  });
}

const divider = "border-t border-[rgb(150_110_50/14%)]";
const kindText: Record<string, string> = { canon: "text-success", tradition: "text-gold-bright", superstition: "text-danger" };

/** Վարքի մեկ բաժին. ինչ անել (✓), սխալ կարծիքներ (✕), հարցեր, այլ բաժիններ։ */
export default function EtiquetteTopic({ loaderData }: Route.ComponentProps) {
  const topic = etiquetteTopic(loaderData.slug)!;
  const navigate = useNavigate();
  const rules = topic.rules.filter((rule) => rule.kind !== "superstition");
  const myths = topic.rules.filter((rule) => rule.kind === "superstition");
  const others = ETIQUETTE_TOPICS.filter((item) => item.status !== "soon" && item.slug !== topic.slug);

  return (
    <PageShell>
      <SiteNav />
      {/* Որոնումը փնտրում է բոլոր բաժիններում (/etiquette?q=), ոչ միայն այս էջում։ */}
      <PageHeader backTo="/etiquette" backLabel="Վարք եկեղեցում" title="" onSearch={() => navigate("/etiquette?q=")} />

      <header className="mt-2 grid gap-2 px-1">
        <h1 className="m-0 font-noto text-[28px] leading-[36px] font-semibold tracking-[-0.3px] text-ink min-[560px]:text-[34px] min-[560px]:leading-[42px]">{topic.title}</h1>
        {topic.summary ? <p className="reading-body m-0 text-[15px] leading-[1.7] text-muted">{topic.summary}</p> : null}
      </header>

      {rules.length ? (
        <section className="mt-6 grid gap-2" aria-labelledby="etq-do">
          <h2 className={groupTitle} id="etq-do">Ինչ անել</h2>
          <ul className={`${card} m-0 list-none p-0`}>
            {rules.map((rule, index) => (
              <li key={rule.id} id={rule.id} className={`flex scroll-mt-24 gap-3 px-4 py-4 target:bg-[rgb(217_181_111/14%)] ${index ? divider : ""}`}>
                <span className="mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full bg-[rgb(61_118_80/15%)] text-success" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
                <div className="grid min-w-0 flex-1 gap-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <h3 className="m-0 text-[15.5px] leading-snug font-semibold text-ink">{rule.title}</h3>
                    <span className={`text-[11.5px] font-semibold ${kindText[rule.kind]}`}>{RULE_KINDS[rule.kind].label}</span>
                  </div>
                  <p className="reading-body m-0 text-[14.5px] leading-[1.65] text-ink">{rule.what}</p>
                  {rule.why ? <p className="reading-body m-0 text-[13.5px] leading-[1.6] text-muted"><span className="font-semibold">Ինչու. </span>{rule.why}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {myths.length ? (
        <section className="mt-6 grid gap-2" aria-labelledby="etq-myths">
          <h2 className={groupTitle} id="etq-myths">Սխալ կարծիքներ</h2>
          <ul className={`${card} m-0 list-none p-0`}>
            {myths.map((rule, index) => (
              <li key={rule.id} id={rule.id} className={`flex scroll-mt-24 gap-3 px-4 py-4 target:bg-[rgb(217_181_111/14%)] ${index ? divider : ""}`}>
                <span className="mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full bg-[rgb(178_72_63/13%)] text-danger" aria-hidden="true"><X size={12} strokeWidth={3} /></span>
                <div className="grid min-w-0 flex-1 gap-1">
                  <h3 className="m-0 text-[15.5px] leading-snug font-semibold text-ink">{rule.title}</h3>
                  <p className="reading-body m-0 text-[14px] leading-[1.6] text-muted">{rule.what}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {topic.faq?.length ? (
        <section className="mt-6 grid gap-2" aria-labelledby="etq-faq">
          <h2 className={groupTitle} id="etq-faq">Հաճախ հարցնում են</h2>
          <div className={`${card} px-1`}>
            {topic.faq.map((item, index) => (
              <details key={item.q} id={`faq-${index}`} className={`group scroll-mt-24 ${index ? divider : ""}`}>
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-[15px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ChevronDown className="shrink-0 text-faint transition-transform group-open:rotate-180" aria-hidden="true" size={18} />
                </summary>
                <p className="reading-body m-0 px-3 pb-3 text-[14.5px] leading-[1.65] text-ink">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6 grid gap-2" aria-labelledby="etq-more">
        <h2 className={groupTitle} id="etq-more">Այլ բաժիններ</h2>
        <ul className={`${card} m-0 list-none p-0`}>
          {others.map((item, index) => (
            <li key={item.slug} className={index ? divider : ""}>
              <Link className="flex min-h-[52px] items-center gap-3.5 px-4 py-2 text-inherit no-underline" to={`/etiquette/${item.slug}`}>
                <span className="grid size-8 shrink-0 place-items-center rounded-control bg-[rgb(176_125_46/14%)] text-gold-bright"><TopicIcon slug={item.slug} size={17} /></span>
                <span className="flex-1 text-[15px] font-medium text-ink">{item.title}</span>
                <ChevronRight className="shrink-0 text-faint" aria-hidden="true" size={18} />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="mx-auto mt-6 mb-0 max-w-[520px] text-center text-[12.5px] leading-relaxed text-muted">
        {topic.status === "review" ? "⚑ Ստուգվում է հոգևորականի կողմից։ " : ""}Ձեր հարցը չկա՞՝ <Link className="text-gold-bright" to="/kap">գրեք մեզ</Link>։
      </p>
    </PageShell>
  );
}
