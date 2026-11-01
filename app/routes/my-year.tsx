import { env } from "cloudflare:workers";
import { Download, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { data, Link, redirect, useRevalidator } from "react-router";

import type { Route } from "./+types/my-year";
import { getOptionalTelegramUser } from "../auth/telegram-user.server";
import { RouteErrorPage } from "../components/error-page";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { panelSection } from "../components/ui-styles";
import { listLiturgyMarks, personalSummary, sundayPromptOn } from "../data/liturgy.server";
import { canMarkDay, periodRange, yerevanDay } from "../utils/liturgy";

export function meta() {
  return [{ title: "Իմ տարին — Հոգևոր ժառանգություն" }, { name: "robots", content: "noindex, nofollow" }];
}

const MONTHS = ["Հունվար", "Փետրվար", "Մարտ", "Ապրիլ", "Մայիս", "Հունիս", "Հուլիս", "Օգոստոս", "Սեպտեմբեր", "Հոկտեմբեր", "Նոյեմբեր", "Դեկտեմբեր"];

/** «2026» → «2026 թվական», «2026-11» → «Նոյեմբեր 2026»։ */
function periodName(period: string) {
  const [year, month] = period.split("-");
  return month ? `${MONTHS[Number(month) - 1]} ${year}` : `${year} թվական`;
}

/**
 * «Իմ տարին» և «Իմ ամիսը». ?period=2026 կամ ?period=2026-11 (լռելյայն՝ ընթացիկ տարին)։
 * Միայն մուտք գործածի իր տվյալները։ Դիզայնը՝ հաջորդ փուլում, հիմա՝ պարզ ու աշխատող։
 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getOptionalTelegramUser(request);
  if (!user) throw redirect("/saved");
  const requested = new URL(request.url).searchParams.get("period") ?? "";
  const period = periodRange(requested) ? requested : yerevanDay().slice(0, 4);
  const [summary, promptOn, marks] = await Promise.all([personalSummary(env.DB, user.id, period), sundayPromptOn(env.DB, user.id), listLiturgyMarks(env.DB, user.id, period)]);
  return data({ period, summary, promptOn, marks, today: yerevanDay(), name: user.displayName }, { headers: { "Cache-Control": "private, no-store" } });
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="frosted-card grid justify-items-center gap-0.5 px-3 py-3 text-center">
      <strong className="font-noto text-[28px] leading-tight text-gold-bright tabular-nums">{value}</strong>
      <span className="text-[12.5px] text-muted">{label}</span>
    </div>
  );
}

export default function MyYear({ loaderData }: Route.ComponentProps) {
  const { period, summary, name } = loaderData;
  const [promptOn, setPromptOn] = useState(loaderData.promptOn);
  const year = period.slice(0, 4);
  const toggle = async () => {
    const next = !promptOn;
    setPromptOn(next);
    const response = await fetch("/api/sunday", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: next }) }).catch(() => null);
    if (!response?.ok) setPromptOn(!next);
  };
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/saved" backLabel="Իմ անկյունը" title={period.includes("-") ? "Իմ ամիսը" : "Իմ տարին"} />
      <p className="mt-1 mb-4 text-center text-[14px] text-muted">{name} · {periodName(period)}</p>
      {summary ? (
        <div className="grid gap-4">
          <section className={`${panelSection} grid gap-3`}>
            <h2 className="m-0 text-[16px] font-bold text-ink">🕊 Սուրբ Պատարագ</h2>
            <div className="grid grid-cols-2 gap-2">
              <Stat value={summary.liturgies} label="անգամ Պատարագի" />
              <Stat value={summary.communions} label="անգամ Հաղորդություն" />
            </div>
          </section>
          <AddLiturgy today={loaderData.today} />
          {loaderData.marks.length ? (
            <section className={`${panelSection} grid gap-2`}>
              <h2 className="m-0 text-[16px] font-bold text-ink">Նշված Պատարագներ</h2>
              {loaderData.marks.map((mark) => <MarkRow key={mark.day} mark={mark} />)}
            </section>
          ) : null}
          <section className={`${panelSection} grid gap-3`}>
            <h2 className="m-0 text-[16px] font-bold text-ink">📖 Ընթերցանություն</h2>
            <div className="grid grid-cols-2 gap-2 min-[560px]:grid-cols-4">
              <Stat value={summary.read} label="կարդացած" />
              <Stat value={summary.listened} label="լսած" />
              <Stat value={summary.activeDays} label="օր" />
              <Stat value={summary.longestStreak} label="օր անընդմեջ" />
            </div>
            {summary.sections.length ? (
              <ul className="m-0 grid list-none gap-1.5 p-0">
                {summary.sections.map((section) => (
                  <li key={section.name} className="flex items-center justify-between rounded-[12px] bg-subtle px-3 py-2 text-[14px] text-ink">
                    <span>{section.name}</span><strong className="tabular-nums text-gold-bright">{section.count}</strong>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          <section className={`${panelSection} grid gap-3`}>
            <h2 className="m-0 text-[16px] font-bold text-ink">⛪ Այլ</h2>
            <div className="grid grid-cols-3 gap-2">
              <Stat value={summary.places} label="սրբավայր" />
              <Stat value={summary.saved} label="պահված նյութ" />
              <Stat value={summary.savedVerses} label="պահված համար" />
            </div>
          </section>
          {summary.months ? (
            <section className={`${panelSection} grid gap-2`}>
              <h2 className="m-0 text-[16px] font-bold text-ink">Ամիսներով</h2>
              {summary.months.map((month) => (
                <Link key={month.month} to={`/my-year?period=${month.month}`} className="flex items-center justify-between rounded-[12px] bg-subtle px-3 py-2 text-[13.5px] text-ink no-underline">
                  <span>{MONTHS[Number(month.month.slice(5)) - 1]}</span>
                  <span className="text-muted tabular-nums">🕊 {month.liturgies} · 📖 {month.read}</span>
                </Link>
              ))}
            </section>
          ) : <Link className="text-center text-[13.5px] text-gold-bright" to={`/my-year?period=${year}`}>← Ամբողջ {year} թվականը</Link>}
          <section className={`${panelSection} grid gap-3`}>
            <label className="flex items-center justify-between gap-3 text-[14px] text-ink">
              <span>Կիրակնօրյա հարց («Եղե՞լ եք Պատարագի»)</span>
              <input type="checkbox" checked={promptOn} onChange={() => void toggle()} />
            </label>
            <a className="inline-flex w-fit items-center gap-2 text-[13.5px] font-semibold text-gold-bright" href={`/api/my-summary?download=${year}`}>
              <Download aria-hidden="true" size={16} /> Ներբեռնել {year} թվականի իմ տվյալները
            </a>
            <p className="m-0 text-[12px] leading-relaxed text-faint">Ամեն տարի փետրվարի 1-ին նախորդ տարվա օրական գրառումները ջնջվում են, մնում է միայն այս ամփոփումը։ Մինչ այդ կարող եք ներբեռնել ամբողջը։ Ձեր տվյալները տեսնում եք միայն Դուք։</p>
          </section>
        </div>
      ) : null}
    </PageShell>
  );
}

const shortDate = (day: string) => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1].toLocaleLowerCase("hy")}`;

/** Մեկ նշված Պատարագ. օրը, առիթը, Հաղորդությունը. վերջին 30 օրվանը կարելի է հանել։ */
function MarkRow({ mark }: { mark: { day: string; communion: boolean; note: string } }) {
  const revalidator = useRevalidator();
  const remove = async () => {
    if (!window.confirm(`Հանե՞լ ${shortDate(mark.day)}-ի Պատարագը։`)) return;
    await fetch("/api/sunday", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ day: mark.day, remove: true }) }).catch(() => null);
    void revalidator.revalidate();
  };
  return (
    <div className="flex items-center gap-2 rounded-[12px] bg-subtle px-3 py-2 text-[13.5px] text-ink">
      <span className="min-w-0 flex-1">{shortDate(mark.day)}{mark.note ? ` · ${mark.note}` : ""}{mark.communion ? " · ✝ Հաղորդություն" : ""}</span>
      {canMarkDay(mark.day) ? <button className="grid size-8 cursor-pointer place-items-center rounded-[9px] border-0 bg-transparent text-faint hover:text-danger" type="button" onClick={() => void remove()} aria-label="Հանել"><Trash2 aria-hidden="true" size={15} /></button> : null}
    </div>
  );
}

/**
 * «➕ Նշել Պատարագ». ցանկացած օր (այսօր կամ վերջին 30 օրը)՝ տոն, եկեղեցու սրբի հիշատակություն,
 * կամ եթե կիրակի հարցին չի պատասխանել։
 */
function AddLiturgy({ today }: { today: string }) {
  const revalidator = useRevalidator();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(today);
  const [communion, setCommunion] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const min = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
  const save = async () => {
    setBusy(true);
    const response = await fetch("/api/sunday", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ day, attended: true, communion, note }) }).catch(() => null);
    setBusy(false);
    if (response?.ok) { setOpen(false); setNote(""); setCommunion(false); void revalidator.revalidate(); }
  };
  if (!open) {
    return <button className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 justify-self-center rounded-[14px] border border-[rgb(217_181_111/45%)] bg-[rgb(217_181_111/10%)] px-4 text-[14px] font-semibold text-gold-bright" type="button" onClick={() => setOpen(true)}><Plus aria-hidden="true" size={16} /> Նշել Պատարագ</button>;
  }
  const field = "min-h-11 rounded-[12px] border border-glass-border bg-control px-3 text-[14px] text-ink";
  return (
    <section className={`${panelSection} grid gap-3`}>
      <h2 className="m-0 text-[16px] font-bold text-ink">Նշել Պատարագ</h2>
      <p className="m-0 text-[12.5px] text-muted">Տոն, եկեղեցու սրբի հիշատակություն կամ ցանկացած օր՝ այսօր կամ վերջին 30 օրվա ընթացքում։</p>
      <label className="grid gap-1 text-[13px] font-semibold text-ink">Օրը<input className={field} type="date" value={day} min={min} max={today} onChange={(event) => setDay(event.target.value)} /></label>
      <label className="grid gap-1 text-[13px] font-semibold text-ink">Առիթը (ոչ պարտադիր)<input className={field} value={note} maxLength={120} onChange={(event) => setNote(event.target.value)} placeholder="Օր.՝ Սուրբ Գրիգոր Նարեկացու տոն" /></label>
      <label className="flex items-center gap-2 text-[14px] text-ink"><input type="checkbox" checked={communion} onChange={(event) => setCommunion(event.target.checked)} /> Ստացել եմ Սուրբ Հաղորդություն</label>
      <div className="flex gap-2">
        <button className="min-h-11 cursor-pointer rounded-[14px] border-0 bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] px-5 text-[14px] font-bold text-[#2a1708] disabled:opacity-60" type="button" disabled={busy || !canMarkDay(day)} onClick={() => void save()}>Պահել</button>
        <button className="min-h-11 cursor-pointer rounded-[14px] border border-glass-border bg-transparent px-4 text-[13.5px] text-muted" type="button" onClick={() => setOpen(false)}>Չեղարկել</button>
      </div>
    </section>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
