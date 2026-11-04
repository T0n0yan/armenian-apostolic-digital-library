import { env } from "cloudflare:workers";
import { HelpCircle, Highlighter, LogIn, NotebookPen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import type { Route } from "./+types/notes";
import { getTelegramUserState } from "../auth/telegram-user.server";
import { listHighlights } from "../data/highlights.server";
import { setChurchNudgeEnabled, churchNudgeEnabled } from "../components/church-nudge";
import { HighlightSheet, formatNoteDate } from "../components/highlight-sheet";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { countBadge, sectionHeader, sectionTitle } from "../components/ui-styles";
import { RouteErrorPage } from "../components/error-page";
import { findMyPosition } from "../utils/my-location";
import type { Highlight } from "../utils/highlights";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Իմ նշումները — Հոգևոր ժառանգություն" },
    { name: "robots", content: "noindex, nofollow, noarchive" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await getTelegramUserState(request);
  if (!auth.user) return { signedIn: false, highlights: [] as Highlight[], failed: false };
  try {
    return { signedIn: true, highlights: await listHighlights(env.DB, auth.user.id), failed: false };
  } catch {
    console.error(JSON.stringify({ event: "notes_loader_error" }));
    return { signedIn: true, highlights: [] as Highlight[], failed: true };
  }
}

type Tab = "marks" | "questions" | "notes";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "marks", label: "Պահված խոսքեր" },
  { id: "questions", label: "❓ Հարցեր" },
  { id: "notes", label: "Նոթերով" },
];

function isTab(value: string | null): value is Tab {
  return value === "marks" || value === "questions" || value === "notes";
}

/** Ըստ բաժնի (Օրվա ընթերցումներ, Սաղմոսներ…), բաժինների կարգը՝ ըստ վերջին նշման։ */
function bySection(items: Highlight[]) {
  const groups = new Map<string, Highlight[]>();
  for (const item of items) {
    const name = item.section || "Այլ նյութեր";
    groups.set(name, [...(groups.get(name) ?? []), item]);
  }
  return [...groups.entries()];
}

function NoteCard({ item, onOpen }: { item: Highlight; onOpen: () => void }) {
  const question = item.kind === "question";
  return (
    <li>
      <button className={`frosted-panel grid w-full cursor-pointer gap-1.5 border-l-4 px-4 py-3 text-left text-ink animate-glass-enter ${question ? "border-l-[rgb(120_165_230/75%)]" : "border-l-[rgb(226_190_90/85%)]"}`} type="button" onClick={onOpen}>
        <span className="flex items-start gap-2">
          {item.emoji || question ? <span className="text-[18px] leading-none" aria-hidden="true">{item.emoji || "❓"}</span> : null}
          <span className="prayer-text line-clamp-4 flex-1 text-[15px] leading-[1.65]">«{item.quote}»</span>
        </span>
        {item.note ? <span className="line-clamp-2 rounded-[10px] bg-subtle px-2.5 py-1.5 text-[13px] leading-snug text-muted">{question ? "" : "✎ "}{item.note}</span> : null}
        {question && item.answeredAt && item.answer ? <span className="line-clamp-2 rounded-[10px] bg-[rgb(74_160_96/10%)] px-2.5 py-1.5 text-[13px] leading-snug text-[rgb(52_130_74)]">✓ {item.answer}</span> : null}
        <span className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-faint">
          <span className="line-clamp-1 font-semibold text-gold-bright">{item.title}</span>
          <span>· {formatNoteDate(item.createdAt)}</span>
        </span>
      </button>
    </li>
  );
}

function ChurchToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(churchNudgeEnabled()), []);
  const [message, setMessage] = useState("");
  const toggle = async () => {
    if (on) { setChurchNudgeEnabled(false); setOn(false); setMessage(""); return; }
    setMessage("Ստուգում ենք դիրքի թույլտվությունը…");
    // Թույլտվությունը հարցվում է միայն այստեղ՝ մարդու սեղմումով։ Դիրքը սարքից դուրս չի գալիս։
    const position = await findMyPosition().catch(() => null);
    if (!position) { setMessage("Դիրքը հասանելի չէ. թույլ տվեք տեղորոշումը բրաուզերի կամ Telegram-ի կարգավորումներում։"); return; }
    setChurchNudgeEnabled(true); setOn(true);
    setMessage("Միացված է. կայք մտնելիս, եթե մոտ եք եկեղեցուն և ունեք հարց, կհուշենք (օրը մեկ անգամ)։");
  };
  return (
    <div className="frosted-panel grid gap-1.5 px-4 py-3">
      <button className="flex cursor-pointer items-center justify-between gap-3 border-0 bg-transparent p-0 text-left text-ink" type="button" role="switch" aria-checked={on} onClick={() => void toggle()}>
        <span className="text-[14px] font-semibold">⛪ Հուշել, երբ մոտ եմ եկեղեցուն</span>
        <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-[rgb(74_160_96)]" : "bg-[rgb(150_140_150/40%)]"}`} aria-hidden="true">
          <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] ${on ? "left-[22px]" : "left-0.5"}`} />
        </span>
      </button>
      <p className="m-0 text-[12px] leading-snug text-faint">{message || "Ձեր դիրքը չի ուղարկվում կայք. հեռավորությունը հաշվում է հեռախոսը։"}</p>
    </div>
  );
}

export default function Notes({ loaderData }: Route.ComponentProps) {
  const [params, setParams] = useSearchParams();
  const tab: Tab = isTab(params.get("tab")) ? params.get("tab") as Tab : "marks";
  const [items, setItems] = useState(loaderData.highlights);
  const [emoji, setEmoji] = useState("");
  const [open, setOpen] = useState<Highlight | null>(null);

  const counts = useMemo(() => ({
    marks: items.filter((item) => item.kind === "mark").length,
    questions: items.filter((item) => item.kind === "question").length,
    notes: items.filter((item) => item.note.trim()).length,
  }), [items]);
  const inTab = items.filter((item) => tab === "marks" ? item.kind === "mark" : tab === "questions" ? item.kind === "question" : Boolean(item.note.trim()));
  const emojis = [...new Set(inTab.map((item) => item.emoji).filter(Boolean))];
  const shown = emoji ? inTab.filter((item) => item.emoji === emoji) : inTab;
  const waiting = shown.filter((item) => item.kind === "question" && !item.answeredAt);
  const answered = shown.filter((item) => item.kind === "question" && item.answeredAt);

  const chooseTab = (next: Tab) => { setEmoji(""); setParams(next === "marks" ? {} : { tab: next }, { replace: true, preventScrollReset: true }); };
  const groups = (list: Highlight[]) => bySection(list).map(([section, list]) => (
    <section className="grid gap-2" key={section}>
      <div className={sectionHeader}><h2 className={sectionTitle}>{section}</h2><span className={countBadge}>{list.length}</span></div>
      <ol className="m-0 grid list-none gap-2 p-0">{list.map((item) => <NoteCard key={item.id} item={item} onOpen={() => setOpen(item)} />)}</ol>
    </section>
  ));
  const empty = (text: string) => <p className="frosted-panel m-0 px-4 py-5 text-center text-[13.5px] leading-relaxed text-muted">{text}</p>;

  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/saved" backLabel="Իմ անկյունը" title="Իմ նշումները" showSearch={loaderData.signedIn && items.length > 0}
        description="Տեքստում ընտրեք տողը և սեղմեք «Պահել» կամ «Հարց»։ Այստեղ դրանք խմբավորված են ըստ բաժնի։" />

      {!loaderData.signedIn ? (
        <section className="frosted-panel mt-4 grid justify-items-center gap-3 px-5 py-7 text-center">
          <span className="grid size-12 place-items-center rounded-full border border-[rgb(217_181_111/30%)] bg-[rgb(217_181_111/10%)] text-gold-bright"><NotebookPen aria-hidden="true" size={22} /></span>
          <h2 className="m-0 font-noto text-[17px] text-ink">Նշումները անձնական են</h2>
          <p className="m-0 max-w-[380px] text-[13.5px] leading-relaxed text-muted">Մուտք գործեք, որպեսզի պահեք Ձեզ դուր եկած խոսքերը, հարցերը և Ձեր նոթերը։ Մուտքն անվճար է։</p>
          <div className="grid w-full max-w-[320px] gap-2">
            <a className="flex min-h-12 items-center justify-center gap-2 rounded-[14px] border border-glass-border bg-[var(--page-bg)] text-[14px] font-semibold text-ink no-underline shadow-card" href="/auth/telegram/start?return=%2Fnotes"><LogIn aria-hidden="true" size={17} /> Մուտք Telegram-ով</a>
            <a className="flex min-h-12 items-center justify-center gap-2 rounded-[14px] border border-glass-border bg-[var(--page-bg)] text-[14px] font-semibold text-ink no-underline shadow-card" href="/auth/google?return=%2Fnotes"><LogIn aria-hidden="true" size={17} /> Մուտք Google-ով</a>
          </div>
        </section>
      ) : (
        <div className="mt-4 grid gap-4">
          {loaderData.failed ? <p className="m-0 text-center text-[13px] text-danger" role="alert">Նշումները չբեռնվեցին. թարմացրեք էջը։</p> : null}
          <div className="grid grid-cols-3 gap-1 rounded-[16px] border border-glass-border bg-subtle p-1" role="tablist" aria-label="Նշումների տեսակը">
            {TABS.map((item) => (
              <button key={item.id} className={`min-h-11 cursor-pointer rounded-[12px] border-0 px-1 text-[13px] font-semibold ${tab === item.id ? "bg-[var(--page-bg)] text-gold-bright shadow-card" : "bg-transparent text-muted"}`}
                type="button" role="tab" aria-selected={tab === item.id} onClick={() => chooseTab(item.id)}>
                {item.label} <span className="tabular-nums opacity-70">{counts[item.id]}</span>
              </button>
            ))}
          </div>

          {emojis.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" aria-label="Ֆիլտր ըստ սմայլիկի">
              <button className={`min-h-9 cursor-pointer rounded-full border px-3 text-[12.5px] font-semibold ${!emoji ? "border-[rgb(217_181_111/60%)] bg-[rgb(217_181_111/14%)] text-gold-bright" : "border-glass-border bg-subtle text-muted"}`} type="button" onClick={() => setEmoji("")}>Բոլորը</button>
              {emojis.map((item) => (
                <button key={item} className={`min-h-9 min-w-11 cursor-pointer rounded-full border px-2 text-[17px] ${emoji === item ? "border-[rgb(217_181_111/60%)] bg-[rgb(217_181_111/14%)]" : "border-glass-border bg-subtle"}`} type="button" aria-pressed={emoji === item} onClick={() => setEmoji(emoji === item ? "" : item)}>{item}</button>
              ))}
            </div>
          ) : null}

          {tab === "questions" ? (
            <>
              <ChurchToggle />
              {shown.length === 0 ? empty("Հարց դեռ չկա։ Կարդալիս ընտրեք անհասկանալի տողը և սեղմեք «❓ Հարց». կարող եք դնել հիշեցում՝ հարցնելու հոգևորականին։") : null}
              {waiting.length ? <><h2 className="m-0 flex items-center gap-2 text-[15px] text-ink"><HelpCircle aria-hidden="true" size={17} className="text-[rgb(90_140_215)]" /> Սպասում են պատասխանի</h2>{groups(waiting)}</> : null}
              {answered.length ? <><h2 className="m-0 mt-2 text-[15px] text-[rgb(52_130_74)]">✓ Պատասխանված</h2>{groups(answered)}</> : null}
            </>
          ) : shown.length === 0 ? (
            empty(tab === "marks"
              ? "Պահված խոսք դեռ չկա։ Կարդալիս ընտրեք Ձեզ դուր եկած տողը և սեղմեք «Պահել»։"
              : "Նոթով նշում դեռ չկա։ Բացեք պահված խոսքը և գրեք, թե ինչ տվեց այն Ձեզ։")
          ) : groups(shown)}

          {items.length === 0 && tab === "marks" ? (
            <p className="m-0 flex items-center justify-center gap-1.5 text-center text-[12px] text-faint"><Highlighter aria-hidden="true" size={14} /> Պահված տողերը տեքստում երևում են մեղմ դեղին, հարցերը՝ կապտավուն։</p>
          ) : null}
        </div>
      )}

      <HighlightSheet item={open} showOpen onClose={() => setOpen(null)}
        onChange={(changed) => setItems((current) => current.map((item) => item.id === changed.id ? changed : item))}
        onDelete={(id) => setItems((current) => current.filter((item) => item.id !== id))} />
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
