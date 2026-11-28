import { env } from "cloudflare:workers";
import { ChevronDown, MessageCircleQuestion, Pencil, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import type { Route } from "./+types/church-questions";
import { can, getOptionalTelegramAdmin } from "../auth/admin.server";
import { ChurchSearchResults } from "../components/church-search";
import { card, groupTitle } from "../components/etiquette-ui";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { CHURCH_TITLE } from "../data/church";
import { listQuestions } from "../data/questions.server";
import { ASK_URL, QUESTION_TOPICS, type QuestionTopic } from "../utils/questions";
import { breadcrumbJsonLd, seoMeta } from "../utils/seo";
import { matchSearchableText, parseTelegramSearchQuery } from "../../shared/telegram-search";

const TITLE = "Հարց ու պատասխան";

export function meta({}: Route.MetaArgs) {
  return seoMeta({
    title: `${TITLE}. ${CHURCH_TITLE} — Apostolic.am`,
    description: "Կարճ պատասխաններ հավատքի, խորհուրդների, Պատարագի, պահքի և ննջեցյալների մասին հաճախ տրվող հարցերին։",
    path: "/church/questions",
    jsonLd: [breadcrumbJsonLd([{ name: "Գլխավոր", path: "/" }, { name: CHURCH_TITLE, path: "/church" }, { name: TITLE, path: "/church/questions" }])],
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await getOptionalTelegramAdmin(request, env.DB).catch(() => null);
  return { questions: await listQuestions(env.DB), editor: can(admin, "guides") };
}

const divider = "border-t border-[rgb(150_110_50/14%)]";

/** «Չգտա՞ք․ հարցրեք»՝ բոտի միջոցով Support խումբ։ */
function AskBox() {
  return (
    <section className={`${card} mt-6 grid gap-2 px-4 py-4`}>
      <h2 className="m-0 flex items-center gap-2 font-noto text-[17px] font-semibold text-gold-bright"><MessageCircleQuestion aria-hidden="true" size={19} />Չգտա՞ք․ հարցրեք</h2>
      <p className="m-0 text-[14px] leading-relaxed text-ink">Գրեք ձեր հարցը մեր Telegram բոտին։ Պատասխանը կտանք, իսկ հաճախ տրվող հարցերը կավելացնենք այստեղ։</p>
      <a className="w-fit text-[14px] font-semibold text-gold-bright" href={ASK_URL} target="_blank" rel="noreferrer">Գրել հարցը →</a>
    </section>
  );
}

/** Հարց ու պատասխան կենտրոն՝ թեմաներով (տարբեր է /questions-ից, որը Աստվածաշնչի հարցերն են)։ */
export default function ChurchQuestions({ loaderData }: Route.ComponentProps) {
  const { questions, editor } = loaderData;
  const [query, setQuery] = useState("");
  const hash = decodeURIComponent(useLocation().hash.slice(1));
  const shown = useMemo(() => {
    const parsed = parseTelegramSearchQuery(query);
    if (!parsed.normalized) return questions;
    return questions.filter((item) => matchSearchableText(item.question, parsed) || matchSearchableText(item.answer, parsed));
  }, [query, questions]);
  const topics = (Object.keys(QUESTION_TOPICS) as QuestionTopic[]).map((topic) => ({ topic, items: shown.filter((item) => item.topic === topic) })).filter((group) => group.items.length);

  useEffect(() => {
    if (!hash.startsWith("q-")) return;
    const target = document.getElementById(hash);
    if (target instanceof HTMLDetailsElement) { target.open = true; target.scrollIntoView({ block: "center" }); }
  }, [hash]);

  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/church" backLabel={CHURCH_TITLE} title="" showSearch={false} />
      <header className="mt-2 grid gap-1.5 px-1">
        <h1 className="m-0 font-noto text-[28px] leading-[36px] font-semibold tracking-[-0.3px] text-ink min-[560px]:text-[34px] min-[560px]:leading-[42px]">{TITLE}</h1>
        <p className="m-0 text-[14.5px] leading-[1.6] text-muted">Կարճ պատասխաններ հաճախ տրվող հարցերին։</p>
        {editor ? <Link className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-gold-bright" to="/admin/questions"><Pencil aria-hidden="true" size={13} />Խմբագրել</Link> : null}
      </header>

      <label className="search-field mt-5 flex min-h-[52px] items-center gap-2.5 pr-2 pl-4">
        <Search aria-hidden="true" size={18} className="shrink-0 text-muted" />
        <span className="sr-only">Փնտրել հարցերում</span>
        <input className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint" type="search" enterKeyHint="search"
          value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Օրինակ՝ կնքահայր, հաղորդություն" />
        {query ? <button type="button" className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-faint hover:text-ink" onClick={() => setQuery("")} aria-label="Մաքրել"><X aria-hidden="true" size={17} /></button> : null}
      </label>

      {query.trim() && !shown.length ? <ChurchSearchResults query={query.trim()} /> : topics.map(({ topic, items }) => (
        <section key={topic} className="mt-6 grid gap-2" aria-labelledby={`topic-${topic}`}>
          <h2 className={groupTitle} id={`topic-${topic}`}>{QUESTION_TOPICS[topic]}</h2>
          <div className={`${card} px-1`}>
            {items.map((item, index) => (
              <details key={item.id} id={`q-${item.id}`} className={`group scroll-mt-24 ${index ? divider : ""}`}>
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-[15px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <ChevronDown className="shrink-0 text-faint transition-transform group-open:rotate-180" aria-hidden="true" size={18} />
                </summary>
                <div className="grid gap-2 px-3 pb-3">
                  <p className="reading-body m-0 whitespace-pre-line text-[14.5px] leading-[1.65] text-ink">{item.answer}</p>
                  {item.status !== "published" ? <span className="w-fit rounded-chip bg-[rgb(178_72_63/12%)] px-2 py-0.5 text-[11.5px] font-bold text-danger">⚑ Ճշտել · Ստուգման մեջ</span> : null}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <AskBox />
      <p className="mx-auto mt-6 mb-0 max-w-[560px] text-center text-[12.5px] leading-relaxed text-muted">Ձեր կոնկրետ դեպքի համար դիմեք ձեր ծխի քահանային։</p>
    </PageShell>
  );
}
