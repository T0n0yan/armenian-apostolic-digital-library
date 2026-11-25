import { CalendarDays, ChevronDown } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import type { Route } from "./+types/church-guide";
import { card, groupTitle, SourceNote } from "../components/etiquette-ui";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { CHURCH_TITLE, churchSection, type GuideBlock } from "../data/church";
import { breadcrumbJsonLd, seoMeta } from "../utils/seo";

export function loader({ params }: Route.LoaderArgs) {
  const section = churchSection(params.section);
  if (!section || section.status === "soon" || !section.guide) throw new Response("Not Found", { status: 404 });
  return { slug: section.slug };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const section = loaderData ? churchSection(loaderData.slug) : null;
  if (!section?.guide) return [{ title: `${CHURCH_TITLE} — Apostolic.am` }];
  const path = `/church/${section.slug}`;
  return seoMeta({
    title: `${section.title}. ${CHURCH_TITLE} — Apostolic.am`,
    description: section.guide.summary,
    path,
    jsonLd: [breadcrumbJsonLd([{ name: "Գլխավոր", path: "/" }, { name: CHURCH_TITLE, path: "/church" }, { name: section.title, path }])],
  });
}

const divider = "border-t border-[rgb(150_110_50/14%)]";

/** Մեկ բլոկ՝ բացվող տող. վերնագիր և «երբ», սեղմելով՝ բացատրությունը։ */
function BlockItem({ block, first, open }: { block: GuideBlock; first: boolean; open: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!open || !ref.current) return;
    ref.current.open = true;
    ref.current.scrollIntoView({ block: "center" });
  }, [open]);
  return (
    <details ref={ref} id={block.id} className={`group scroll-mt-24 ${first ? "" : divider}`}>
      <summary className="flex min-h-[60px] cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-[rgb(217_181_111/8%)] [&::-webkit-details-marker]:hidden">
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-[16px] leading-snug font-semibold text-ink">{block.title}</span>
          {block.when ? <span className="flex items-center gap-1.5 text-[12.5px] text-muted"><CalendarDays aria-hidden="true" size={13} className="shrink-0 text-gold" />{block.when}</span> : null}
        </span>
        <ChevronDown className="shrink-0 text-faint transition-transform group-open:rotate-180" aria-hidden="true" size={18} />
      </summary>
      <div className="grid gap-2.5 px-4 pb-4">
        <p className="reading-body m-0 text-[15px] leading-[1.7] text-ink">{block.text}</p>
        {block.why ? <p className="reading-body m-0 rounded-button bg-[rgb(217_181_111/12%)] px-3.5 py-2.5 text-[14px] leading-[1.65] text-ink"><span className="font-semibold text-gold-bright">Ինչու. </span>{block.why}</p> : null}
      </div>
    </details>
  );
}

/** «Կարգեր և վարքեր»-ի ուղեցույցի էջ (օր.՝ Հիշատակության օրեր)։ */
export default function ChurchGuide({ loaderData }: Route.ComponentProps) {
  const section = churchSection(loaderData.slug)!;
  const guide = section.guide!;
  const hash = decodeURIComponent(useLocation().hash.slice(1));
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/church" backLabel={CHURCH_TITLE} title="" />
      <header className="mt-2 grid gap-2 px-1">
        <h1 className="m-0 font-noto text-[28px] leading-[36px] font-semibold tracking-[-0.3px] text-ink min-[560px]:text-[34px] min-[560px]:leading-[42px]">{section.title}</h1>
        <p className="reading-body m-0 text-[15px] leading-[1.7] text-muted">{guide.summary}</p>
      </header>

      <section className="mt-6 grid gap-2" aria-labelledby="guide-blocks">
        <h2 className={groupTitle} id="guide-blocks">Սեղմեք՝ կարդալու համար</h2>
        <div className={`${card} overflow-hidden`}>
          {guide.blocks.map((block, index) => <BlockItem key={block.id} block={block} first={index === 0} open={hash === block.id} />)}
        </div>
      </section>

      {guide.faq?.length ? (
        <section className="mt-6 grid gap-2" aria-labelledby="guide-faq">
          <h2 className={groupTitle} id="guide-faq">Հաճախ հարցնում են</h2>
          <div className={`${card} px-1`}>
            {guide.faq.map((item, index) => (
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

      <SourceNote sources={guide.sources} reviewing={section.status === "review"} />
    </PageShell>
  );
}
