import { env } from "cloudflare:workers";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useRevalidator, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/etiquette-topic";
import { card, groupTitle, SourceNote } from "../components/etiquette-ui";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { RULE_KINDS, etiquetteTopic, readyEtiquetteTopics, type EtiquetteRule } from "../data/etiquette";
import { breadcrumbJsonLd, seoMeta } from "../utils/seo";
import { CHURCH_TITLE } from "../data/church";
import { listEtiquetteLinks, type EtiquetteLink } from "../data/etiquette-links.server";
import { fieldControl, primaryButton } from "../components/ui-styles";

export async function loader({ params }: Route.LoaderArgs) {
  const topic = etiquetteTopic(params.topic);
  if (!topic || topic.status === "soon") throw new Response("Not Found", { status: 404 });
  // Ադմինի կցած հղումները (տեսանյութ, հոդված)։ Բազայի սխալը էջը չի կոտրում։
  const links = await listEtiquetteLinks(env.DB, topic.slug).catch(() => [] as EtiquetteLink[]);
  return { slug: topic.slug, links };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const topic = loaderData ? etiquetteTopic(loaderData.slug) : null;
  if (!topic) return [{ title: "Վարք եկեղեցում — Apostolic.am" }];
  const path = `/church/etiquette/${topic.slug}`;
  return seoMeta({
    title: `${topic.title}. վարք եկեղեցում — Apostolic.am`,
    description: topic.summary ?? topic.description,
    path,
    jsonLd: [breadcrumbJsonLd([{ name: "Գլխավոր", path: "/" }, { name: CHURCH_TITLE, path: "/church" }, { name: "Վարք եկեղեցում", path: "/church/etiquette" }, { name: topic.title, path }]),
      // Հարց ու պատասխանը՝ որոնողական համակարգերի համար (օր.՝ «գունավոր մոմեր»)
      ...(topic.faq?.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: topic.faq.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })) }] : [])],
  });
}

/** Աղոթքը՝ ինչպես կայքի աղոթքների էջում. թռչնատառ և գրքի տառատեսակ։ */
function PrayerText({ text }: { text: string }) {
  const body = text.replace(/^«/, "").replace(/»։?$/, "");
  return (
    <div className="prayer-layout reading-body">
      <p className="layout-paragraph layout-font-book m-0 whitespace-pre-line text-[16.5px] leading-[1.85] text-ink">
        <span className="ornate-initial">{body.charAt(0)}</span>{body.slice(1)}
      </p>
    </div>
  );
}

/** Կանոնին կցված հղումները և ադմինի համար՝ ավելացնել/ջնջել։ */
function RuleLinks({ topic, ruleId, links, canEdit }: { topic: string; ruleId: string; links: EtiquetteLink[]; canEdit: boolean }) {
  const revalidator = useRevalidator();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(body: object) {
    setBusy(true); setError("");
    const response = await fetch("/api/etiquette-links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const result = await response?.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    setBusy(false);
    if (!result?.ok) { setError(result?.error === "bad-url" ? "Հասցեն սխալ է (պետք է սկսվի https://-ով)։" : "Չստացվեց, փորձեք նորից։"); return false; }
    revalidator.revalidate();
    return true;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (await send({ action: "add", topic, ruleId, url: form.get("url"), title: form.get("title") })) setAdding(false);
  }
  if (!links.length && !canEdit) return null;
  return (
    <div className="grid min-w-0 gap-1.5">
      {links.length ? <span className="text-[12px] font-semibold text-muted">Տես նաև</span> : null}
      {links.map((link) => (
        <span key={link.id} className="flex min-w-0 items-center gap-2">
          <a className="inline-flex min-w-0 items-center gap-1.5 text-[14px] text-gold-bright underline-offset-2 hover:underline" href={link.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden="true" size={14} className="shrink-0" /><span className="truncate">{link.title}</span>
          </a>
          {canEdit ? <button type="button" className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:text-danger" aria-label={`Ջնջել «${link.title}» հղումը`} disabled={busy}
            onClick={() => { if (window.confirm("Ջնջե՞լ այս հղումը")) void send({ action: "delete", id: link.id }); }}><X aria-hidden="true" size={14} /></button> : null}
        </span>
      ))}
      {canEdit && !adding ? (
        <button type="button" className="inline-flex w-fit items-center gap-1 text-[12.5px] font-semibold text-muted hover:text-gold-bright" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" size={14} />Ավելացնել հղում
        </button>
      ) : null}
      {canEdit && adding ? (
        <form className="grid gap-2" onSubmit={submit}>
          <input className={fieldControl} name="url" type="url" inputMode="url" required placeholder="https://…" aria-label="Հղման հասցեն" />
          <input className={fieldControl} name="title" maxLength={120} placeholder="Անուն (օր.՝ տեսանյութ Հաղորդության մասին)" aria-label="Հղման անունը" />
          <span className="flex gap-2">
            <button type="submit" className={primaryButton} disabled={busy}>Պահել</button>
            <button type="button" className="rounded-button px-3.5 py-2 text-[13.5px] text-muted" onClick={() => { setAdding(false); setError(""); }}>Չեղարկել</button>
          </span>
        </form>
      ) : null}
      {error ? <span className="text-[12.5px] text-danger" role="alert">{error}</span> : null}
    </div>
  );
}

const divider = "border-t border-[rgb(150_110_50/14%)]";
const kindText: Record<string, string> = { canon: "text-success", tradition: "text-gold-bright", advice: "text-muted", superstition: "text-danger" };

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
  const rootData = useRouteLoaderData("root") as { adminPermissions?: string[] } | undefined;
  const canEdit = Boolean(rootData?.adminPermissions?.includes("layout"));
  const linksFor = (ruleId: string) => loaderData.links.filter((link) => link.ruleId === ruleId);
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
      <PageHeader backTo="/church/etiquette" backLabel="Վարք եկեղեցում" title="" onSearch={() => navigate("/church/etiquette?q=")} />

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
                {rule.style === "prayer" ? <PrayerText text={rule.what} /> : <p className="reading-body m-0 whitespace-pre-line text-[15px] leading-[1.7] text-ink">{rule.what}</p>}
                {rule.why ? <p className="reading-body m-0 whitespace-pre-line rounded-button bg-[rgb(217_181_111/12%)] px-3.5 py-2.5 text-[14px] leading-[1.65] text-ink"><span className="font-semibold text-gold-bright">Ինչու. </span>{rule.why}</p> : null}
                <RuleLinks topic={topic.slug} ruleId={rule.id} links={linksFor(rule.id)} canEdit={canEdit} />
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
                <p className="reading-body m-0 whitespace-pre-line text-[15px] leading-[1.7] text-ink"><span className="font-semibold text-success">Իրականում. </span>{rule.what}</p>
                <RuleLinks topic={topic.slug} ruleId={rule.id} links={linksFor(rule.id)} canEdit={canEdit} />
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
          <Link className={`${card} flex min-h-[64px] items-center gap-2 px-3.5 py-2 text-inherit no-underline`} to={`/church/etiquette/${prev.slug}`}>
            <ChevronLeft className="shrink-0 text-gold" aria-hidden="true" size={20} />
            <span className="grid min-w-0"><span className="text-[11.5px] text-muted">Նախորդը</span><strong className="text-[14px] leading-snug font-semibold text-ink">{prev.title}</strong></span>
          </Link>
        ) : <Link className={`${card} flex min-h-[64px] items-center gap-2 px-3.5 py-2 text-[14px] font-semibold text-gold-bright no-underline`} to="/church/etiquette"><ChevronLeft aria-hidden="true" size={20} />Բոլոր բաժինները</Link>}
        {next ? (
          <Link className={`${card} flex min-h-[64px] items-center justify-end gap-2 px-3.5 py-2 text-right text-inherit no-underline`} to={`/church/etiquette/${next.slug}`}>
            <span className="grid min-w-0"><span className="text-[11.5px] text-muted">Հաջորդը</span><strong className="text-[14px] leading-snug font-semibold text-ink">{next.title}</strong></span>
            <ChevronRight className="shrink-0 text-gold" aria-hidden="true" size={20} />
          </Link>
        ) : <Link className={`${card} flex min-h-[64px] items-center justify-end gap-2 px-3.5 py-2 text-[14px] font-semibold text-gold-bright no-underline`} to="/church/etiquette">Բոլոր բաժինները<ChevronRight aria-hidden="true" size={20} /></Link>}
      </nav>

      <SourceNote sources={topic.sources} reviewing={topic.status === "review"} />
    </PageShell>
  );
}
