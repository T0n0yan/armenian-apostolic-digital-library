import { Check, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import type { Route } from "./+types/etiquette-topic";
import { card, groupTitle } from "../components/etiquette-ui";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { RULE_KINDS, etiquetteTopic, readyEtiquetteTopics, type EtiquetteRule } from "../data/etiquette";
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

/** Մեկ կանոն՝ բացվող տող. վերնագիրը միշտ երևում է, պատասխանը՝ սեղմելով։ */
function RuleItem({ rule, first, open, icon, children }: { rule: EtiquetteRule; first: boolean; open: boolean; icon: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!open || !ref.current) return;
    ref.current.open = true;
    ref.current.scrollIntoView({ block: "center" });
  }, [open]);
  return (
    <details ref={ref} id={rule.id} className={`group scroll-mt-24 ${first ? "" : divider}`}>
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-[rgb(217_181_111/8%)] [&::-webkit-details-marker]:hidden">
        {icon}
        <span className="flex-1 text-[15.5px] leading-snug font-semibold text-ink">{rule.title}</span>
        <ChevronDown className="shrink-0 text-faint transition-transform group-open:rotate-180" aria-hidden="true" size={18} />
      </summary>
      <div className="grid gap-2.5 px-4 pb-4 pl-[50px]">{children}</div>
    </details>
  );
}

/** Վարքի մեկ բաժին. ինչ անել (✓), սխալ կարծիքներ (✕), հարցեր, այլ բաժիններ։ */
export default function EtiquetteTopic({ loaderData }: Route.ComponentProps) {
  const topic = etiquetteTopic(loaderData.slug)!;
  const navigate = useNavigate();
  const rules = topic.rules.filter((rule) => rule.kind !== "superstition");
  const myths = topic.rules.filter((rule) => rule.kind === "superstition");
  const ready = readyEtiquetteTopics();
  const at = ready.findIndex((item) => item.slug === topic.slug);
  const prev = ready[at - 1];
  const next = ready[at + 1];
  // Հղումով եկած կանոնը (#headscarf) բաց է։
  const hash = decodeURIComponent(useLocation().hash.slice(1));

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
          <h2 className={groupTitle} id="etq-do">Ինչ անել · սեղմեք՝ կարդալու համար</h2>
          <div className={`${card} overflow-hidden`}>
            {rules.map((rule, index) => (
              <RuleItem key={rule.id} rule={rule} first={index === 0} open={hash === rule.id}
                icon={<span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-[rgb(61_118_80/15%)] text-success" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>}>
                <p className="reading-body m-0 text-[15px] leading-[1.7] text-ink">{rule.what}</p>
                {rule.why ? <p className="reading-body m-0 rounded-button bg-[rgb(217_181_111/12%)] px-3.5 py-2.5 text-[14px] leading-[1.65] text-ink"><span className="font-semibold text-gold-bright">Ինչու. </span>{rule.why}</p> : null}
                <span className={`text-[12px] font-semibold ${kindText[rule.kind]}`}>{RULE_KINDS[rule.kind].label}՝ {RULE_KINDS[rule.kind].hint}</span>
              </RuleItem>
            ))}
          </div>
        </section>
      ) : null}

      {myths.length ? (
        <section className="mt-6 grid gap-2" aria-labelledby="etq-myths">
          <h2 className={groupTitle} id="etq-myths">Ճիշտ չէ, թեև ասում են</h2>
          <div className={`${card} overflow-hidden`}>
            {myths.map((rule, index) => (
              <RuleItem key={rule.id} rule={rule} first={index === 0} open={hash === rule.id}
                icon={<span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-[rgb(178_72_63/13%)] text-danger" aria-hidden="true"><X size={12} strokeWidth={3} /></span>}>
                <p className="reading-body m-0 text-[15px] leading-[1.7] text-ink"><span className="font-semibold text-success">Իրականում. </span>{rule.what}</p>
              </RuleItem>
            ))}
          </div>
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

      <nav className="mt-6 grid grid-cols-2 gap-2.5" aria-label="Այլ բաժիններ">
        {prev ? (
          <Link className={`${card} flex min-h-[64px] items-center gap-2 px-3.5 py-2 text-inherit no-underline`} to={`/etiquette/${prev.slug}`}>
            <ChevronLeft className="shrink-0 text-gold" aria-hidden="true" size={20} />
            <span className="grid min-w-0"><span className="text-[11.5px] text-muted">Նախորդը</span><strong className="text-[14px] leading-snug font-semibold text-ink">{prev.title}</strong></span>
          </Link>
        ) : <Link className={`${card} flex min-h-[64px] items-center gap-2 px-3.5 py-2 text-[14px] font-semibold text-gold-bright no-underline`} to="/etiquette"><ChevronLeft aria-hidden="true" size={20} />Բոլոր բաժինները</Link>}
        {next ? (
          <Link className={`${card} flex min-h-[64px] items-center justify-end gap-2 px-3.5 py-2 text-right text-inherit no-underline`} to={`/etiquette/${next.slug}`}>
            <span className="grid min-w-0"><span className="text-[11.5px] text-muted">Հաջորդը</span><strong className="text-[14px] leading-snug font-semibold text-ink">{next.title}</strong></span>
            <ChevronRight className="shrink-0 text-gold" aria-hidden="true" size={20} />
          </Link>
        ) : <Link className={`${card} flex min-h-[64px] items-center justify-end gap-2 px-3.5 py-2 text-[14px] font-semibold text-gold-bright no-underline`} to="/etiquette">Բոլոր բաժինները<ChevronRight aria-hidden="true" size={20} /></Link>}
      </nav>

      <p className="mx-auto mt-6 mb-0 max-w-[520px] text-center text-[12.5px] leading-relaxed text-muted">
        {topic.status === "review" ? "⚑ Ստուգվում է հոգևորականի կողմից։ " : ""}Ձեր հարցը չկա՞՝ <Link className="text-gold-bright" to="/kap">գրեք մեզ</Link>։
      </p>
    </PageShell>
  );
}
