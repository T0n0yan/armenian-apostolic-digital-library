import { HelpCircle, Highlighter } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { churchNudgeEnabled, setChurchNudgeEnabled } from "./church-nudge";
import { HighlightSheet, formatNoteDate } from "./highlight-sheet";
import { countBadge, sectionHeader, sectionTitle } from "./ui-styles";
import { findMyPosition } from "../utils/my-location";
import { firstEmoji, type Highlight } from "../utils/highlights";

type Kind = "marks" | "questions" | "notes";
const KINDS: Array<{ id: Kind; label: string }> = [
  { id: "marks", label: "Խոսքեր" },
  { id: "questions", label: "❓ Հարցեր" },
  { id: "notes", label: "Նշումներով" },
];

function isKind(value: string | null): value is Kind {
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
          {item.emoji || question ? <span className="text-[18px] leading-none" aria-hidden="true">{firstEmoji(item.emoji) || "❓"}</span> : null}
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
      {message ? <p className="m-0 text-[12px] leading-snug text-faint">{message}</p> : null}
    </div>
  );
}

/** «Իմ նշումները» ներդիրը «Իմ անկյունը»-ում. Խոսքեր · ❓ Հարցեր · Նոթերով, ըստ բաժնի։ */
export function NotesPanel({ highlights, failed }: { highlights: Highlight[]; failed: boolean }) {
  const [params, setParams] = useSearchParams();
  const kind: Kind = isKind(params.get("kind")) ? params.get("kind") as Kind : "marks";
  const [items, setItems] = useState(highlights);
  const [emoji, setEmoji] = useState("");
  const [open, setOpen] = useState<Highlight | null>(null);

  const counts = useMemo(() => ({
    marks: items.filter((item) => item.kind === "mark").length,
    questions: items.filter((item) => item.kind === "question").length,
    notes: items.filter((item) => item.note.trim()).length,
  }), [items]);
  const inTab = items.filter((item) => kind === "marks" ? item.kind === "mark" : kind === "questions" ? item.kind === "question" : Boolean(item.note.trim()));
  const emojis = [...new Set(inTab.map((item) => firstEmoji(item.emoji)).filter(Boolean))];
  const shown = emoji ? inTab.filter((item) => firstEmoji(item.emoji) === emoji) : inTab;
  const waiting = shown.filter((item) => item.kind === "question" && !item.answeredAt);
  const answered = shown.filter((item) => item.kind === "question" && item.answeredAt);

  const chooseKind = (next: Kind) => {
    setEmoji("");
    setParams((current) => { const copy = new URLSearchParams(current); copy.set("tab", "notes"); if (next === "marks") copy.delete("kind"); else copy.set("kind", next); return copy; }, { replace: true, preventScrollReset: true });
  };
  const groups = (list: Highlight[]) => bySection(list).map(([section, list]) => (
    <section className="grid gap-2" key={section}>
      <div className={sectionHeader}><h3 className={sectionTitle}>{section}</h3><span className={countBadge}>{list.length}</span></div>
      <ol className="m-0 grid list-none gap-2 p-0">{list.map((item) => <NoteCard key={item.id} item={item} onOpen={() => setOpen(item)} />)}</ol>
    </section>
  ));
  const empty = (text: string) => <p className="frosted-panel m-0 px-4 py-5 text-center text-[13.5px] leading-relaxed text-muted">{text}</p>;

  return (
    <div className="grid gap-4">
      {failed ? <p className="m-0 text-center text-[13px] text-danger" role="alert">Նշումները չբեռնվեցին. թարմացրեք էջը։</p> : null}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Նշումների տեսակը">
        {KINDS.map((item) => (
          <button key={item.id} className={`min-h-9 cursor-pointer rounded-full border px-3.5 text-[13px] font-semibold ${kind === item.id ? "border-[rgb(217_181_111/60%)] bg-[rgb(217_181_111/14%)] text-gold-bright" : "border-glass-border bg-subtle text-muted"}`}
            type="button" aria-pressed={kind === item.id} onClick={() => chooseKind(item.id)}>
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

      {kind === "questions" ? (
        <>
          <ChurchToggle />
          {shown.length === 0 ? empty("Հարց դեռ չկա։ Կարդալիս սեղմեք անհասկանալի նախադասության վրա և ընտրեք «❓ Հարց». կարող եք դնել հիշեցում՝ հարցնելու հոգևորականին։") : null}
          {waiting.length ? <><h3 className="m-0 flex items-center gap-2 text-[15px] text-ink"><HelpCircle aria-hidden="true" size={17} className="text-[rgb(90_140_215)]" /> Սպասում են պատասխանի</h3>{groups(waiting)}</> : null}
          {answered.length ? <><h3 className="m-0 mt-2 text-[15px] text-[rgb(52_130_74)]">✓ Պատասխանված</h3>{groups(answered)}</> : null}
        </>
      ) : shown.length === 0 ? (
        empty(kind === "marks"
          ? "Պահված խոսք դեռ չկա։ Կարդալիս սեղմեք Ձեզ դուր եկած նախադասության վրա և ընտրեք «Պահել»։"
          : "Նշումով խոսք դեռ չկա։ Բացեք պահված խոսքը և գրեք, թե ինչ տվեց այն Ձեզ։")
      ) : groups(shown)}

      {items.length === 0 && kind === "marks" ? (
        <p className="m-0 flex items-center justify-center gap-1.5 text-center text-[12px] text-faint"><Highlighter aria-hidden="true" size={14} /> Պահված տողերը տեքստում երևում են մեղմ դեղին, հարցերը՝ կապտավուն։</p>
      ) : null}

      <HighlightSheet item={open} showOpen onClose={() => setOpen(null)}
        onChange={(changed) => setItems((current) => current.map((item) => item.id === changed.id ? changed : item))}
        onDelete={(id) => setItems((current) => current.filter((item) => item.id !== id))} />
    </div>
  );
}
