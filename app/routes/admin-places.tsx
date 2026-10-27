import { env } from "cloudflare:workers";
import { Check, Eye, EyeOff, ImageOff, MapPin, Plus, X } from "lucide-react";
import { useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";

import type { Route } from "./+types/admin-places";
import { requireAdmin, requireSameOrigin } from "../auth/admin.server";
import { RouteErrorPage } from "../components/error-page";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { fieldControl, panelSection, primaryButton } from "../components/ui-styles";
import { createPlace, dismissSubmission, listOpenSubmissions, listPlaces, placeFromSubmission, setPlacesPublished } from "../data/places.server";
import { formatArmenianDate } from "../utils/armenian-date";
import { ACTIVE_LABELS, isPlaceKind, parseCoordinates, PLACE_KINDS, placeMediaUrl, type PlaceKind } from "../utils/places";

type Bindings = { DB: D1Database; MEDIA: R2Bucket; TELEGRAM_BOT_TOKEN?: string };

export function meta() {
  return [{ title: "Սրբավայրեր — Կառավարում" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request, env.DB).catch((error: unknown) => {
    if (error instanceof Response && (error.status === 401 || error.status === 403)) throw redirect("/");
    throw error;
  });
  const [submissions, places] = await Promise.all([listOpenSubmissions(env.DB), listPlaces(env.DB, { publishedOnly: false })]);
  return { submissions, places };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request, env.DB);
  requireSameOrigin(request);
  const { DB, MEDIA, TELEGRAM_BOT_TOKEN } = env as unknown as Bindings;
  const form = await request.formData();
  const intent = form.get("intent");
  const name = String(form.get("name") ?? "").trim();
  const point = parseCoordinates(String(form.get("coordinates") ?? ""));

  // Showing or hiding on the public map: one place, or every place of a kind.
  if (intent === "show" || intent === "hide") {
    const id = String(form.get("placeId") ?? "");
    const kind = form.get("kind");
    if (id) await setPlacesPublished(DB, intent === "show", { id });
    else if (isPlaceKind(kind)) await setPlacesPublished(DB, intent === "show", { kind });
    return redirect(`/admin/places${new URL(request.url).search}`);
  }
  if (intent === "dismiss") {
    await dismissSubmission(DB, Number(form.get("submissionId")));
    return redirect("/admin/places");
  }
  if (intent === "from-submission") {
    const submissionId = Number(form.get("submissionId"));
    if (!name) return data({ error: "Գրեք տեղի անունը։", submissionId }, { status: 400 });
    if (point) await DB.prepare("UPDATE place_submissions SET latitude = ?, longitude = ? WHERE id = ?").bind(point.latitude, point.longitude, submissionId).run();
    const id = await placeFromSubmission(DB, MEDIA, TELEGRAM_BOT_TOKEN?.trim() ?? "", submissionId, name);
    if (!id) return data({ error: "Տեղադրություն չկա. տեղադրեք կոորդինատները կամ Google Maps-ի հղումը։", submissionId }, { status: 400 });
    return redirect(`/admin/places/${id}`);
  }
  if (intent === "new") {
    if (!name || !point) return data({ error: "Գրեք անունը և կոորդինատները (կամ Google Maps-ի հղումը)։", submissionId: 0 }, { status: 400 });
    const id = await createPlace(DB, { name, ...point });
    return redirect(`/admin/places/${id}`);
  }
  return data({ error: "Անհայտ գործողություն։", submissionId: 0 }, { status: 400 });
}

const card = "frosted-card grid gap-3 p-4";
const smallButton = "inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[12px] border border-glass-border bg-subtle px-3 text-[13px] font-semibold text-ink";

/** Readers' /place submissions waiting for a decision, and every place on the map. */
export default function AdminPlaces({ loaderData, actionData }: Route.ComponentProps) {
  const { submissions, places } = loaderData;
  const busy = useNavigation().state === "submitting";
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<"all" | "shown" | "hidden">("all");
  const [kind, setKind] = useState<PlaceKind | "">("");
  const query = filter.trim().toLocaleLowerCase("hy");
  const shown = places.filter((place) =>
    (!query || `${place.name} ${place.region}`.toLocaleLowerCase("hy").includes(query))
    && (status === "all" || place.published === (status === "shown"))
    && (!kind || place.kind === kind));
  const visibleCount = places.filter((place) => place.published).length;
  const kinds = (Object.keys(PLACE_KINDS) as PlaceKind[]).map((id) => ({ id, total: places.filter((place) => place.kind === id).length, visible: places.filter((place) => place.kind === id && place.published).length })).filter((entry) => entry.total > 0);
  const tab = (active: boolean) => `inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold ${active ? "border-[rgb(217_181_111/60%)] bg-[rgb(217_181_111/18%)] text-gold-bright" : "border-glass-border bg-subtle text-muted"}`;
  return (
    <PageShell width="admin">
      <SiteNav />
      <PageHeader backTo="/admin" backLabel="Կառավարում" title="Սրբավայրեր" />
      <div className="mt-4 grid gap-5">
        <section className={`${panelSection} grid gap-3`}>
          <h2 className="m-0 text-[17px] font-bold text-ink">Նոր առաջարկներ{submissions.length ? ` (${submissions.length})` : ""}</h2>
          <p className="m-0 text-[13px] text-muted">Ինչ մարդիկ ուղարկել են բոտին /place հրամանով։ «Ստեղծել տեղ»-ը նկարները բերում է կայք, տեղը պատրաստում է, բայց չի հրապարակում։</p>
          {submissions.length === 0 ? <p className="m-0 text-[13px] text-faint">Նոր առաջարկ չկա։</p> : null}
          {submissions.map((submission) => (
            <article key={submission.id} className={card}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-[15px] text-ink">{submission.placeName ? `«${submission.placeName}» · ` : ""}{submission.senderName}</strong>
                <span className="text-[12px] text-faint">
                  {formatArmenianDate(submission.createdAt)} · {submission.credit === null ? "անունը նշելու մասին չի պատասխանել" : submission.credit ? `կայքում նշել «${submission.creditName || submission.senderName}»` : "անանուն"}
                </span>
              </div>
              {submission.photos.length ? (
                <div className="flex gap-2 overflow-x-auto">
                  {submission.photos.map((fileId) => <img key={fileId} className="h-28 w-auto shrink-0 rounded-[10px] object-cover" src={`/admin/telegram-file/${encodeURIComponent(fileId)}`} alt="" loading="lazy" />)}
                </div>
              ) : <p className="m-0 flex items-center gap-1.5 text-[13px] text-faint"><ImageOff aria-hidden="true" size={15} /> Նկար չկա</p>}
              {submission.videos.length ? <p className="m-0 text-[13px] text-muted">🎬 Տեսանյութ՝ {submission.videos.length}</p> : null}
              {([["Տեսակը", isPlaceKind(submission.kind) ? PLACE_KINDS[submission.kind] : submission.kindNote], ["Մարզը", submission.region], ["Գործո՞ղ է", ACTIVE_LABELS[submission.active] ?? ""], ["Սուրբ Պատարագ", submission.liturgy], ["Ժամերգություններ", submission.services], ["Ծառայողներ", submission.clergy], ["Բաց է", submission.openHours], ["Ճանապարհը և մուտքը", submission.accessibility], ["Պատմությունը", submission.notes]] as const).map(([label, value]) => value ? (
                <p key={label} className="m-0 whitespace-pre-line text-[14px] leading-relaxed text-ink"><span className="font-semibold text-muted">{label}՝ </span>{value}</p>
              ) : null)}
              {submission.latitude !== null && submission.longitude !== null ? (
                <a className="flex w-fit items-center gap-1.5 text-[13px] text-gold-bright" href={`https://www.google.com/maps?q=${submission.latitude},${submission.longitude}`} target="_blank" rel="noreferrer">
                  <MapPin aria-hidden="true" size={15} /> {submission.latitude.toFixed(5)}, {submission.longitude.toFixed(5)}
                </a>
              ) : <p className="m-0 text-[13px] font-semibold text-danger">Տեղադրություն չի ուղարկվել. տեղադրեք ներքևում։</p>}
              <Form method="post" className="grid gap-2 min-[560px]:grid-cols-[1fr_auto]">
                <input type="hidden" name="submissionId" value={submission.id} />
                <div className="grid gap-2">
                  <input className={fieldControl} name="name" placeholder="Տեղի անունը, օր.՝ Սուրբ Գրիգոր Լուսավորիչ" defaultValue={submission.placeName || submission.notes.split("\n")[0].replace(/^\d+\.\s*/u, "").slice(0, 80)} required />
                  {submission.latitude === null ? <input className={fieldControl} name="coordinates" placeholder="40.1617, 44.2913 կամ Google Maps-ի հղում" /> : null}
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <button className={primaryButton} type="submit" name="intent" value="from-submission" disabled={busy}><Check aria-hidden="true" size={16} /> Ստեղծել տեղ</button>
                  <button className={smallButton} type="submit" name="intent" value="dismiss" formNoValidate disabled={busy}><X aria-hidden="true" size={15} /> Մերժել</button>
                </div>
                {actionData?.error && actionData.submissionId === submission.id ? <p className="m-0 text-[13px] text-danger">{actionData.error}</p> : null}
              </Form>
            </article>
          ))}
        </section>

        <section className={`${panelSection} grid gap-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[17px] font-bold text-ink">Տեղեր ({visibleCount} ցուցադրված · {places.length - visibleCount} թաքցված)</h2>
            <Link className="text-[13px] text-gold-bright" to="/places">Բացել քարտեզը →</Link>
          </div>
          <p className="m-0 text-[13px] text-muted">Քարտեզում երևում են միայն «ցուցադրված» տեղերը։ Թաքցվածները (օր.՝ OpenStreetMap-ից բերվածները) սպասում են ձեր որոշմանը. ցուցադրեք մեկ-մեկ կամ ամբողջ տեսակը միանգամից։</p>
          {kinds.length ? (
            <div className="grid gap-2 min-[700px]:grid-cols-2">
              {kinds.map((entry) => (
                <Form key={entry.id} method="post" className="frosted-card flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <input type="hidden" name="kind" value={entry.id} />
                  <span className="text-[14px] text-ink"><strong>{PLACE_KINDS[entry.id]}</strong> <span className="text-muted">· {entry.visible} / {entry.total} ցուցադրված</span></span>
                  <span className="flex gap-1.5">
                    {entry.visible < entry.total ? <button className={smallButton} type="submit" name="intent" value="show" disabled={busy}><Eye aria-hidden="true" size={15} /> Ցուցադրել բոլորը</button> : null}
                    {entry.visible > 0 ? <button className={smallButton} type="submit" name="intent" value="hide" disabled={busy}><EyeOff aria-hidden="true" size={15} /> Թաքցնել բոլորը</button> : null}
                  </span>
                </Form>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ցույց տալ">
            {([["all", "Բոլորը"], ["shown", "Ցուցադրված"], ["hidden", "Թաքցված"]] as const).map(([value, label]) => <button key={value} type="button" className={tab(status === value)} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>)}
            <span className="mx-1 w-px self-stretch bg-glass-border" aria-hidden="true" />
            <button type="button" className={tab(kind === "")} aria-pressed={kind === ""} onClick={() => setKind("")}>Բոլոր տեսակները</button>
            {kinds.map((entry) => <button key={entry.id} type="button" className={tab(kind === entry.id)} aria-pressed={kind === entry.id} onClick={() => setKind(entry.id)}>{PLACE_KINDS[entry.id]}</button>)}
          </div>
          <input className={fieldControl} type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Փնտրել անունով կամ մարզով…" aria-label="Փնտրել տեղերը" />
          <div className="grid gap-2">
            {shown.slice(0, 150).map((place) => (
              <div key={place.id} className="frosted-card flex items-center gap-2 p-3">
              <Link className="flex min-w-0 flex-1 items-center gap-3 text-inherit no-underline" to={`/admin/places/${place.id}`}>
                <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-[#efe3c8]">
                  {place.icon ? <img className="size-full object-contain" src={placeMediaUrl(place.icon)} alt="" /> : place.photos[0] ? <img className="size-full object-cover" src={placeMediaUrl(place.photos[0])} alt="" /> : <MapPin aria-hidden="true" size={20} className="text-faint" />}
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <strong className="truncate text-[14.5px] text-ink">{place.name}</strong>
                  <span className="text-[12px] text-muted">
                    {PLACE_KINDS[place.kind]}{place.region ? ` · ${place.region}` : ""}{place.verified ? "" : " · ⚑ Ճշտել"}{place.icon ? "" : " · գծանկար չկա"}
                  </span>
                </span>
              </Link>
              <Form method="post" className="shrink-0">
                <input type="hidden" name="placeId" value={place.id} />
                {place.published
                  ? <button className={`${smallButton} text-[#3f8f5a]`} type="submit" name="intent" value="hide" disabled={busy} title="Թաքցնել քարտեզից"><Eye aria-hidden="true" size={15} /> Ցուցադրված</button>
                  : <button className={`${smallButton} text-faint`} type="submit" name="intent" value="show" disabled={busy} title="Ցուցադրել քարտեզում"><EyeOff aria-hidden="true" size={15} /> Թաքցված</button>}
              </Form>
              </div>
            ))}
            {shown.length > 150 ? <p className="m-0 text-center text-[12.5px] text-faint">Ցույց է տրված 150-ը {shown.length}-ից. գրեք անունը՝ գտնելու համար։</p> : null}
          </div>
          <Form method="post" className="grid gap-2 border-t border-glass-border pt-3 min-[560px]:grid-cols-[1fr_1fr_auto]">
            <input className={fieldControl} name="name" placeholder="Նոր տեղի անունը" required />
            <input className={fieldControl} name="coordinates" placeholder="40.1617, 44.2913 կամ Google Maps-ի հղում" required />
            <button className={primaryButton} type="submit" name="intent" value="new" disabled={busy}><Plus aria-hidden="true" size={16} /> Ավելացնել</button>
            {actionData?.error && actionData.submissionId === 0 ? <p className="m-0 text-[13px] text-danger min-[560px]:col-span-3">{actionData.error}</p> : null}
          </Form>
        </section>
      </div>
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
