import { env } from "cloudflare:workers";
import { Check, Plus, RotateCcw, SkipForward, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Form, Link, useFetcher, useNavigation } from "react-router";

import type { Route } from "./+types/admin-patarag";
import { requirePermission, requireSameOrigin } from "../auth/admin.server";
import { guidesAdmin } from "../auth/guides-admin.server";
import { ChurchAudioUpload } from "../components/church-audio-upload";
import { RouteErrorPage } from "../components/error-page";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { fieldControl, fieldLabel, panelSection, primaryButton } from "../components/ui-styles";
import { deleteLiturgyLine, getChurchAudio, listLiturgyLines, saveLiturgyLine, saveLiturgyTimings } from "../data/liturgy-text.server";
import { isSpeaker, SPEAKERS, type LiturgyLine, type Speaker } from "../utils/liturgy-text";

export function meta() {
  return [{ title: "Պատարագամատույց — Կառավարում" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await guidesAdmin(request);
  const [lines, audio] = await Promise.all([listLiturgyLines(env.DB), getChurchAudio(env.DB, "patarag")]);
  return { lines, audio };
}

const text = (form: FormData, name: string, max = 8000) => String(form.get(name) ?? "").replace(/\r\n?/gu, "\n").trim().slice(0, max);

export async function action({ request }: Route.ActionArgs) {
  const admin = await requirePermission(request, env.DB, "guides");
  requireSameOrigin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  const id = Number(form.get("id")) || undefined;
  if (intent === "delete" && id) { await deleteLiturgyLine(env.DB, id); return { ok: true }; }
  if (intent === "timings") {
    let starts: Record<string, unknown> = {};
    try { starts = JSON.parse(String(form.get("starts") ?? "{}")) as Record<string, unknown>; } catch { return { error: "Սխալ ժամանակներ։" }; }
    const clean = Object.fromEntries(Object.entries(starts).filter(([key, value]) => /^\d+$/u.test(key) && (value === null || (typeof value === "number" && value >= 0 && value < 36_000)))
      .map(([key, value]) => [key, value === null ? null : Math.round((value as number) * 100) / 100])) as Record<string, number | null>;
    await saveLiturgyTimings(env.DB, clean);
    return { ok: true };
  }
  const speaker = form.get("speaker");
  const line = { id, sort: Math.max(0, Math.min(999_999, Number(form.get("sort")) || 0)), part: text(form, "part", 200), speaker: (isSpeaker(speaker) ? speaker : "priest") as Speaker,
    grabar: text(form, "grabar"), ashkharhabar: text(form, "ashkharhabar"), rubric: text(form, "rubric", 1000), note: text(form, "note", 2000) };
  if (!line.grabar && !line.ashkharhabar && !line.rubric) return { error: "Տողը դատարկ է։" };
  await saveLiturgyLine(env.DB, line, admin.email);
  return { ok: true };
}

const small = "inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full border border-edge bg-subtle px-3 text-[12.5px] font-bold text-ink disabled:opacity-40";
const area = `${fieldControl} min-h-[80px] resize-y leading-relaxed`;
const clock = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;

function LineForm({ line, nextSort, onDone }: { line?: LiturgyLine; nextSort: number; onDone?: () => void }) {
  const busy = useNavigation().state !== "idle";
  return (
    <Form method="post" className={`${panelSection} grid gap-3`} onSubmit={() => onDone?.()}>
      {line ? <input type="hidden" name="id" value={line.id} /> : null}
      <div className="grid gap-3 min-[560px]:grid-cols-[minmax(0,1fr)_160px_110px]">
        <label className={fieldLabel}>Մաս<input className={fieldControl} name="part" defaultValue={line?.part ?? ""} maxLength={200} placeholder="Օր.՝ Նախապատրաստություն" /></label>
        <label className={fieldLabel}>Ով է ասում
          <select className={fieldControl} name="speaker" defaultValue={line?.speaker ?? "priest"}>
            {(Object.keys(SPEAKERS) as Speaker[]).map((speaker) => <option key={speaker} value={speaker}>{SPEAKERS[speaker]}</option>)}
          </select>
        </label>
        <label className={fieldLabel}>Կարգը<input className={fieldControl} name="sort" type="number" min={0} defaultValue={line?.sort ?? nextSort} /></label>
      </div>
      <label className={fieldLabel}>Գրաբար<textarea className={`${area} prayer-text`} name="grabar" defaultValue={line?.grabar ?? ""} /></label>
      <label className={fieldLabel}>Աշխարհաբար<textarea className={area} name="ashkharhabar" defaultValue={line?.ashkharhabar ?? ""} /></label>
      <label className={fieldLabel}>Ցուցում (ինչ է կատարվում)<input className={fieldControl} name="rubric" defaultValue={line?.rubric ?? ""} maxLength={1000} /></label>
      <label className={fieldLabel}>Բացատրություն<textarea className={area} name="note" defaultValue={line?.note ?? ""} /></label>
      <div className="flex flex-wrap gap-2">
        <button className={`${primaryButton} w-fit`} type="submit" name="intent" value="save" disabled={busy}>{line ? "Պահել" : "Ավելացնել տող"}</button>
        {line ? <button className={small} type="submit" name="intent" value="delete" formNoValidate onClick={(event) => { if (!confirm("Ջնջե՞լ տողը")) event.preventDefault(); }}><Trash2 aria-hidden="true" size={14} />Ջնջել</button> : null}
        {onDone ? <button className={small} type="button" onClick={onDone}>Փակել</button> : null}
      </div>
    </Form>
  );
}

/** Ժամանակների նշում. ձայնագրությունը նվագելիս ամեն սեղմում նշում է հաջորդ տողի սկիզբը։ */
function TimingMarker({ lines, url }: { lines: LiturgyLine[]; url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const fetcher = useFetcher();
  const [draft, setDraft] = useState<Array<number | null> | null>(null);
  const next = draft ? draft.findIndex((value) => value === null) : -1;
  const mark = () => {
    const audio = audioRef.current;
    if (!audio || !draft || next < 0) return;
    setDraft(draft.map((value, index) => index === next ? audio.currentTime : value));
  };
  const save = () => {
    if (!draft) return;
    fetcher.submit({ intent: "timings", starts: JSON.stringify(Object.fromEntries(lines.map((line, index) => [line.id, draft[index]]))) }, { method: "post" });
    setDraft(null);
  };
  const marked = lines.filter((line) => line.start !== null).length;
  return (
    <div className="grid gap-2">
      <audio ref={audioRef} className="w-full" src={url} controls preload="none" />
      {draft ? (<>
        <p className="m-0 text-[14px]">{next >= 0 ? <>Հաջորդը՝ <strong>{next + 1}. {lines[next].grabar || lines[next].ashkharhabar || lines[next].rubric}</strong></> : "Բոլոր տողերը նշված են։"}</p>
        <div className="flex flex-wrap gap-2">
          <button className={primaryButton} type="button" onClick={mark} disabled={next < 0}><SkipForward aria-hidden="true" size={16} />Տողը սկսվեց</button>
          <button className={small} type="button" onClick={save}><Check aria-hidden="true" size={14} />Պահել</button>
          <button className={small} type="button" onClick={() => setDraft(null)}>Չեղարկել</button>
        </div>
      </>) : (
        <div className="flex flex-wrap items-center gap-2">
          <button className={small} type="button" onClick={() => { setDraft(lines.map(() => null)); if (audioRef.current) { audioRef.current.currentTime = 0; void audioRef.current.play().catch(() => null); } }}>Նշել ժամանակները սկզբից</button>
          {marked ? <button className={small} type="button" onClick={() => fetcher.submit({ intent: "timings", starts: JSON.stringify(Object.fromEntries(lines.map((line) => [line.id, null]))) }, { method: "post" })}><RotateCcw aria-hidden="true" size={14} />Մաքրել</button> : null}
          <span className="text-[12.5px] text-muted">Նշված է {marked} / {lines.length} տող</span>
        </div>
      )}
    </div>
  );
}

export default function AdminPatarag({ loaderData, actionData }: Route.ComponentProps) {
  const { lines, audio } = loaderData;
  const [editing, setEditing] = useState<number | null>(null);
  const nextSort = (lines.at(-1)?.sort ?? 0) + 10;
  return (
    <PageShell>
      <SiteNav />
      <PageHeader showSearch={false} backTo="/admin/guides" backLabel="Կարգեր և վարքեր" title="Պատարագամատույց" />
      <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <p className="m-0 px-1 text-[14px] leading-relaxed text-muted">
          Ամեն տող՝ մաս, ով է ասում, գրաբար, աշխարհաբար, ցուցում, բացատրություն։ «Ժողովուրդ» և «Բոլորը» տողերը էջում ընդգծված են։
          Կարգը՝ թվով (10, 20, 30…). մեջտեղում ավելացնելու համար՝ 15։ Էջը՝ <Link className="text-gold-bright" to="/church/patarag">/church/patarag</Link>։
        </p>
        {actionData && "error" in actionData ? <p className="m-0 text-[13px] text-danger">{actionData.error}</p> : null}

        <section className={`${panelSection} grid gap-3`}>
          <h2 className="m-0 text-[16px] font-bold">Երգչախմբի ձայնագրություն</h2>
          <ChurchAudioUpload id="patarag" audio={audio} />
          {audio && lines.length ? <><h3 className="m-0 mt-2 text-[14px] font-bold">Տողերի ժամանակները</h3><TimingMarker lines={lines} url={audio.url} /></> : null}
        </section>

        <h2 className="m-0 px-1 text-[12px] font-bold tracking-[1.2px] text-gold uppercase">Տողեր ({lines.length})</h2>
        {lines.map((line) => editing === line.id
          ? <LineForm key={line.id} line={line} nextSort={nextSort} onDone={() => setEditing(null)} />
          : (
            <button key={line.id} type="button" className={`${panelSection} grid cursor-pointer gap-0.5 !p-3.5 text-left text-inherit`} onClick={() => setEditing(line.id)}>
              <span className="text-[12px] text-muted">{line.sort} · {line.part || "—"} · {SPEAKERS[line.speaker]}{line.start !== null ? ` · ${clock(line.start)}` : ""}</span>
              <span className="prayer-text line-clamp-2 text-[15px]">{line.grabar || line.ashkharhabar || line.rubric}</span>
            </button>
          ))}

        <h2 className="m-0 px-1 text-[12px] font-bold tracking-[1.2px] text-gold uppercase"><Plus aria-hidden="true" size={13} className="inline" /> Նոր տող</h2>
        <LineForm key={`new-${lines.length}`} nextSort={nextSort} />
      </div>
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
