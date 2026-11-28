import { env } from "cloudflare:workers";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Form, Link, useNavigation, useSearchParams } from "react-router";

import type { Route } from "./+types/admin-hymns";
import { requirePermission, requireSameOrigin } from "../auth/admin.server";
import { guidesAdmin } from "../auth/guides-admin.server";
import { ChurchAudioUpload } from "../components/church-audio-upload";
import { RouteErrorPage } from "../components/error-page";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { fieldControl, fieldLabel, panelSection, primaryButton } from "../components/ui-styles";
import { deleteHymn, listHymns, saveHymn } from "../data/hymns.server";
import { listChurchAudio, removeChurchAudio } from "../data/liturgy-text.server";
import { GUIDE_STATUSES, type GuideStatus } from "../utils/guides";
import { HOURS, isHour, MODES, type Hour, type Hymn } from "../utils/hymns";

export function meta() {
  return [{ title: "Շարականներ — Կառավարում" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await guidesAdmin(request);
  const [hymns, audio] = await Promise.all([listHymns(env.DB, true), listChurchAudio(env.DB, "hymn-")]);
  return { hymns, audio: Object.fromEntries(audio) };
}

const text = (form: FormData, name: string, max = 8000) => String(form.get(name) ?? "").replace(/\r\n?/gu, "\n").trim().slice(0, max);

export async function action({ request }: Route.ActionArgs) {
  const admin = await requirePermission(request, env.DB, "guides");
  requireSameOrigin(request);
  const form = await request.formData();
  const id = Number(form.get("id")) || undefined;
  if (form.get("intent") === "delete" && id) {
    await removeChurchAudio(env.DB, (env as unknown as { MEDIA: R2Bucket }).MEDIA, `hymn-${id}`);
    await deleteHymn(env.DB, id);
    return { ok: true };
  }
  const title = text(form, "title", 200), hour = form.get("hour"), status = String(form.get("status"));
  if (!title) return { error: "Անունը պարտադիր է։" };
  await saveHymn(env.DB, {
    id, title, feast: text(form, "feast", 200), hour: isHour(hour) ? hour : "", mode: text(form, "mode", 40), performer: text(form, "performer", 200),
    grabar: text(form, "grabar"), ashkharhabar: text(form, "ashkharhabar"), note: text(form, "note", 2000),
    status: (status in GUIDE_STATUSES ? status : "draft") as GuideStatus, sort: Math.max(0, Math.min(999_999, Number(form.get("sort")) || 0)),
  }, admin.email);
  return { ok: true };
}

const small = "inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full border border-edge bg-subtle px-3 text-[12.5px] font-bold text-ink";
const area = `${fieldControl} min-h-[96px] resize-y leading-relaxed`;

function HymnForm({ hymn, audio, onDone }: { hymn?: Hymn; audio?: { url: string; size: number } | null; onDone?: () => void }) {
  const busy = useNavigation().state !== "idle";
  return (
    <div className={`${panelSection} grid gap-3`}>
      <Form method="post" className="grid gap-3" onSubmit={() => onDone?.()}>
        {hymn ? <input type="hidden" name="id" value={hymn.id} /> : null}
        <label className={fieldLabel}>Անուն<input className={fieldControl} name="title" defaultValue={hymn?.title ?? ""} required maxLength={200} /></label>
        <div className="grid gap-3 min-[560px]:grid-cols-2">
          <label className={fieldLabel}>Տոն<input className={fieldControl} name="feast" defaultValue={hymn?.feast ?? ""} maxLength={200} placeholder="Սուրբ Զատիկ" /></label>
          <label className={fieldLabel}>Ժամ
            <select className={fieldControl} name="hour" defaultValue={hymn?.hour ?? ""}>
              <option value="">—</option>
              {(Object.keys(HOURS) as Hour[]).map((hour) => <option key={hour} value={hour}>{HOURS[hour]}</option>)}
            </select>
          </label>
          <label className={fieldLabel}>Ձայնեղանակ
            <select className={fieldControl} name="mode" defaultValue={hymn?.mode ?? ""}>
              <option value="">—</option>
              {MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </select>
          </label>
          <label className={fieldLabel}>Կատարող<input className={fieldControl} name="performer" defaultValue={hymn?.performer ?? ""} maxLength={200} /></label>
          <label className={fieldLabel}>Կարգավիճակ
            <select className={fieldControl} name="status" defaultValue={hymn?.status ?? "draft"}>
              {(Object.keys(GUIDE_STATUSES) as GuideStatus[]).map((status) => <option key={status} value={status}>{GUIDE_STATUSES[status]}</option>)}
            </select>
          </label>
          <label className={fieldLabel}>Կարգը<input className={fieldControl} name="sort" type="number" min={0} defaultValue={hymn?.sort ?? 100} /></label>
        </div>
        <label className={fieldLabel}>Գրաբար<textarea className={`${area} prayer-text`} name="grabar" defaultValue={hymn?.grabar ?? ""} /></label>
        <label className={fieldLabel}>Աշխարհաբար<textarea className={area} name="ashkharhabar" defaultValue={hymn?.ashkharhabar ?? ""} /></label>
        <label className={fieldLabel}>Նշում (հեղինակ, պատմություն)<textarea className={area} name="note" defaultValue={hymn?.note ?? ""} /></label>
        <div className="flex flex-wrap gap-2">
          <button className={`${primaryButton} w-fit`} type="submit" name="intent" value="save" disabled={busy}>{hymn ? "Պահել" : "Ավելացնել"}</button>
          {hymn ? <button className={small} type="submit" name="intent" value="delete" formNoValidate onClick={(event) => { if (!confirm("Ջնջե՞լ շարականը (ձայնագրությամբ)")) event.preventDefault(); }}><Trash2 aria-hidden="true" size={14} />Ջնջել</button> : null}
          {onDone ? <button className={small} type="button" onClick={onDone}>Փակել</button> : null}
        </div>
      </Form>
      {hymn ? <><h3 className="m-0 text-[14px] font-bold">Ձայնագրություն</h3><ChurchAudioUpload id={`hymn-${hymn.id}`} audio={audio ?? null} /></> : <p className="m-0 text-[12.5px] text-muted">Ձայնագրությունը՝ պահելուց հետո։</p>}
    </div>
  );
}

export default function AdminHymns({ loaderData, actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const [editing, setEditing] = useState<number | null>(Number(params.get("edit")) || null);
  return (
    <PageShell>
      <SiteNav />
      <PageHeader showSearch={false} backTo="/admin/guides" backLabel="Կարգեր և վարքեր" title="Շարականներ" />
      <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <p className="m-0 px-1 text-[14px] text-muted">Էջը՝ <Link className="text-gold-bright" to="/church/sharakanner">/church/sharakanner</Link>։ «Ժամ»-ը կապում է շարականը Ժամերգությունների էջի հետ։</p>
        {actionData && "error" in actionData ? <p className="m-0 text-[13px] text-danger">{actionData.error}</p> : null}
        <h2 className="m-0 px-1 text-[12px] font-bold tracking-[1.2px] text-gold uppercase">Նոր շարական</h2>
        <HymnForm key={`new-${loaderData.hymns.length}`} />
        <h2 className="m-0 px-1 text-[12px] font-bold tracking-[1.2px] text-gold uppercase">Շարականներ ({loaderData.hymns.length})</h2>
        {loaderData.hymns.map((hymn) => editing === hymn.id
          ? <HymnForm key={hymn.id} hymn={hymn} audio={loaderData.audio[`hymn-${hymn.id}`]} onDone={() => setEditing(null)} />
          : (
            <button key={hymn.id} type="button" className={`${panelSection} grid cursor-pointer gap-0.5 !p-3.5 text-left text-inherit`} onClick={() => setEditing(hymn.id)}>
              <strong className="text-[15px]">{hymn.title}</strong>
              <span className="text-[12.5px] text-muted">{[hymn.feast, hymn.hour ? HOURS[hymn.hour] : "", hymn.mode, GUIDE_STATUSES[hymn.status], loaderData.audio[`hymn-${hymn.id}`] ? "▶ ձայնագրություն" : ""].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
      </div>
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
