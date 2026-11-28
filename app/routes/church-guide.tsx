import { env } from "cloudflare:workers";
import { CalendarDays, ChevronDown, Pencil } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router";
import type { Route } from "./+types/church-guide";
import { can, getOptionalTelegramAdmin } from "../auth/admin.server";
import { card, groupTitle, SourceNote } from "../components/etiquette-ui";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { CHURCH_TITLE } from "../data/church";
import { getGuide } from "../data/guides.server";
import { hymnCountsByHour } from "../data/hymns.server";
import { BLOCK_PARTS, GUIDE_STATUSES, GUIDE_TAGS, isGuideSlug, type GuideBlock } from "../utils/guides";
import { breadcrumbJsonLd, NOINDEX, seoMeta } from "../utils/seo";
import { VesselsGallery } from "../vessels3d/gallery";

export async function loader({ request, params }: Route.LoaderArgs) {
  const guide = isGuideSlug(params.section) ? await getGuide(env.DB, params.section) : null;
  if (!guide || guide.kind !== "guide") throw new Response("Not Found", { status: 404 });
  const admin = await getOptionalTelegramAdmin(request, env.DB).catch(() => null);
  const editor = can(admin, "guides");
  // Սևագիրը տեսնում է միայն խմբագիրը։
  if (guide.status === "draft" && !editor) throw new Response("Not Found", { status: 404 });
  // Ժամերգություններ. ամեն ժամի տակ՝ նրա շարականների հղումը։
  const hymns = guide.slug === "hours" ? await hymnCountsByHour(env.DB).catch(() => ({})) : {};
  return { guide, editor, hymns: hymns as Record<string, number> };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const guide = loaderData?.guide;
  if (!guide) return [{ title: `${CHURCH_TITLE} — Apostolic.am` }];
  const path = `/church/${guide.slug}`;
  const tags = seoMeta({
    title: `${guide.title}. ${CHURCH_TITLE} — Apostolic.am`,
    description: guide.summary || guide.description,
    path,
    jsonLd: [breadcrumbJsonLd([{ name: "Գլխավոր", path: "/" }, { name: CHURCH_TITLE, path: "/church" }, { name: guide.title, path }])],
  });
  return guide.status === "draft" ? [...tags, ...NOINDEX] : tags;
}

const divider = "border-t border-[rgb(150_110_50/14%)]";
const flag = "w-fit rounded-chip bg-[rgb(178_72_63/12%)] px-2 py-0.5 text-[11.5px] font-bold text-danger";

/** Մեկ բլոկ՝ բացվող տող. վերնագիր և «երբ», սեղմելով՝ ձևանմուշի մասերը։ */
function BlockItem({ block, first, open, draft, hymns = 0 }: { block: GuideBlock; first: boolean; open: boolean; draft: boolean; hymns?: number }) {
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
        <div className="flex flex-wrap gap-1.5">
          {block.tag ? <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${GUIDE_TAGS[block.tag].className}`}>{GUIDE_TAGS[block.tag].label}</span> : null}
          {draft ? <span className={flag}>⚑ Ճշտել</span> : null}
        </div>
        {block.text ? <p className="reading-body m-0 whitespace-pre-line text-[15px] leading-[1.7] text-ink">{block.text}</p> : null}
        {BLOCK_PARTS.map(([key, label]) => block[key] ? (
          key === "why"
            ? <p key={key} className="reading-body m-0 whitespace-pre-line rounded-button bg-[rgb(217_181_111/12%)] px-3.5 py-2.5 text-[14px] leading-[1.65] text-ink"><span className="font-semibold text-gold-bright">Ինչու. </span>{block.why}</p>
            : <div key={key} className="grid gap-1">
                <h3 className="m-0 text-[12px] font-bold tracking-[1.2px] text-gold uppercase">{label}</h3>
                <p className={`reading-body m-0 whitespace-pre-line text-[15px] leading-[1.7] text-ink ${key === "prayer" ? "prayer-text" : ""}`}>{block[key]}</p>
              </div>
        ) : null)}
        {hymns ? <Link className="w-fit text-[14px] font-semibold text-gold-bright" to={`/church/sharakanner?hour=${block.id}`}>Շարականներ՝ {hymns} →</Link> : null}
      </div>
    </details>
  );
}

/** «Կարգեր և վարքեր»-ի ուղեցույցի էջ (Յոթ խորհուրդներ, Հիշատակության օրեր և այլն)։ */
export default function ChurchGuide({ loaderData }: Route.ComponentProps) {
  const { guide, editor, hymns } = loaderData;
  const hash = decodeURIComponent(useLocation().hash.slice(1));
  const checked = guide.status === "published";
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/church" backLabel={CHURCH_TITLE} title="" />
      <header className="mt-2 grid gap-2 px-1">
        <h1 className="m-0 font-noto text-[28px] leading-[36px] font-semibold tracking-[-0.3px] text-ink min-[560px]:text-[34px] min-[560px]:leading-[42px]">{guide.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`w-fit rounded-chip px-2 py-0.5 text-[11.5px] font-bold ${checked ? "bg-[rgb(61_118_80/16%)] text-success" : "bg-[rgb(217_181_111/20%)] text-gold-bright"}`}>
            {GUIDE_STATUSES[guide.status]}{checked && guide.verifiedBy ? ` · ${guide.verifiedBy}` : ""}
          </span>
          {editor ? <Link className="inline-flex items-center gap-1 text-[13px] font-semibold text-gold-bright" to={`/admin/guides/${guide.slug}`}><Pencil aria-hidden="true" size={13} />Խմբագրել</Link> : null}
        </div>
        {guide.summary ? <p className="reading-body m-0 text-[15px] leading-[1.7] text-muted">{guide.summary}</p> : null}
      </header>

      {/* Եկեղեցական սպասք՝ 3D (առայժմ միայն staging-ում) */}
      {guide.slug === "symbols" ? <VesselsGallery /> : null}

      {guide.body.blocks.length ? (
        <section className="mt-6 grid gap-2" aria-labelledby="guide-blocks">
          <h2 className={groupTitle} id="guide-blocks">Սեղմեք՝ կարդալու համար</h2>
          <div className={`${card} overflow-hidden`}>
            {guide.body.blocks.map((block, index) => <BlockItem key={block.id} block={block} first={index === 0} open={hash === block.id} draft={!checked} hymns={hymns[block.id]} />)}
          </div>
        </section>
      ) : null}

      {guide.body.faq.length ? (
        <section className="mt-6 grid gap-2" aria-labelledby="guide-faq">
          <h2 className={groupTitle} id="guide-faq">Հաճախ հարցնում են</h2>
          <div className={`${card} px-1`}>
            {guide.body.faq.map((item, index) => (
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

      <SourceNote sources={guide.sources} reviewing={!checked} />
    </PageShell>
  );
}
