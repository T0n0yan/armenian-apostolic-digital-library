import { bumpCacheEpoch } from "../data/site-refresh.server";
import { env } from "cloudflare:workers";
import { Ban, Check, ClipboardCopy, Download, Eye, EyeOff, Footprints, ImageOff, MapPin, Plus, Trash2, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";

import type { Route } from "./+types/admin-places";
import { can, requirePermission, requireSameOrigin } from "../auth/admin.server";
import { RouteErrorPage } from "../components/error-page";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { fieldControl, panelSection, primaryButton } from "../components/ui-styles";
import { getOptionalTelegramUser, upsertAppUser } from "../auth/telegram-user.server";
import {
  addBlocklistWord, createPlace, deletePlace, dismissSubmission, listBlocklist, listOpenSubmissions, listPlaces, listVisitedIds, placeFromSubmission,
  removeBlocklistWord, setPlacesPublished, setVisited, type Place,
} from "../data/places.server";
import { formatArmenianDate } from "../utils/armenian-date";
import { ACTIVE_LABELS, blockedWords, isPlaceKind, parseCoordinates, placeMatches, PLACE_KINDS, placeMediaUrl, type PlaceKind } from "../utils/places";

type Bindings = { DB: D1Database; MEDIA: R2Bucket; TELEGRAM_BOT_TOKEN?: string };

export function meta() {
  return [{ title: "Սրբավայրեր — Կառավարում" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requirePermission(request, env.DB, "places").catch((error: unknown) => {
    if (error instanceof Response && (error.status === 401 || error.status === 403)) throw redirect("/");
    throw error;
  });
  const user = await getOptionalTelegramUser(request);
  const [submissions, places, blocklist, visited] = await Promise.all([
    listOpenSubmissions(env.DB), listPlaces(env.DB, { publishedOnly: false }), listBlocklist(env.DB), user ? listVisitedIds(env.DB, user.id) : [],
  ]);
  return { submissions, places, blocklist, visited, canVisit: Boolean(user), canDelete: can(admin, "places-delete"), isOwner: admin.owner };
}

async function performAction({ request }: Route.ActionArgs) {
  const admin = await requirePermission(request, env.DB, "places");
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
  const back = redirect(`/admin/places${new URL(request.url).search}`);
  // Deleting and the blocklist need their own permission.
  if ((intent === "block-add" || intent === "block-remove" || intent === "delete-blocked" || intent === "delete") && !can(admin, "places-delete")) {
    throw new Response("Not allowed.", { status: 403 });
  }
  if (intent === "block-add") {
    const word = String(form.get("word") ?? "").trim();
    if (word.length < 2) return data({ error: "Գրեք առնվազն 2 տառ։", submissionId: -1 }, { status: 400 });
    await addBlocklistWord(DB, word);
    return back;
  }
  if (intent === "block-remove") {
    await removeBlocklistWord(DB, String(form.get("word") ?? ""));
    return back;
  }
  // Deletes every place the blocklist catches (they are remembered, so an import won't bring them back).
  if (intent === "delete-blocked") {
    const words = await listBlocklist(DB);
    for (const place of await listPlaces(DB, { publishedOnly: false })) if (blockedWords(place.name, words).length) await deletePlace(DB, MEDIA, place.id);
    return back;
  }
  if (intent === "delete") {
    await deletePlace(DB, MEDIA, String(form.get("placeId") ?? ""));
    return back;
  }
  if (intent === "visit" || intent === "unvisit") {
    const user = await getOptionalTelegramUser(request);
    if (!user) return data({ error: "«Եղել եմ»-ը պահվում է Telegram-ով մուտք գործած հաշվում։", submissionId: -1 }, { status: 400 });
    await upsertAppUser(DB, user);
    await setVisited(DB, user.id, String(form.get("placeId") ?? ""), intent === "visit");
    return back;
  }
  if (intent === "dismiss") {
    await dismissSubmission(DB, MEDIA, Number(form.get("submissionId")));
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
const tab = (active: boolean) => `inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold ${active ? "border-[rgb(217_181_111/60%)] bg-[rgb(217_181_111/18%)] text-gold-bright" : "border-glass-border bg-subtle text-muted"}`;
const smallButton = "inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[12px] border border-glass-border bg-subtle px-3 text-[13px] font-semibold text-ink";

/** Readers' /place submissions waiting for a decision, and every place on the map. */
const OSM_TYPES: Record<string, string> = { n: "node", w: "way", r: "relation" };
const osmLink = (id: string) => (OSM_TYPES[id[0]] ? `https://www.openstreetmap.org/${OSM_TYPES[id[0]]}/${id.slice(1)}` : "");
const provinceOf = (place: Pick<Place, "region">) => place.region.split(", ")[0] || "Առանց մարզի";
const CHUNK = 50;

/** One line per place, numbered, for pasting into a chat with an assistant that checks the list. */
function listText(places: Place[], from: number) {
  return places.map((place, index) => [
    `${from + index + 1}. ${place.name}`,
    place.region ? ` — ${place.region}` : "",
    ` (${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)})`,
    place.osmId ? ` OSM: ${osmLink(place.osmId)}` : "",
    place.wikidata ? ` Wikidata: ${place.wikidata}` : "",
  ].join("")).join("\n");
}

/** The filtered places as a spreadsheet (Excel opens it; the BOM keeps the Armenian letters right). */
function downloadCsv(places: Place[], visited: Set<string>) {
  const cell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = [["#", "Անուն", "Տեսակ", "Մարզ", "Բնակավայր", "Լայնություն", "Երկայնություն", "Ցուցադրված", "Եղել եմ", "OSM", "Wikidata", "Կայքի հասցե"],
    ...places.map((place, index) => [index + 1, place.name, PLACE_KINDS[place.kind], provinceOf(place), place.region.split(", ").slice(1).join(", "),
      place.latitude.toFixed(6), place.longitude.toFixed(6), place.published ? "այո" : "ոչ", visited.has(place.id) ? "այո" : "", place.osmId ? osmLink(place.osmId) : "",
      place.wikidata, `/admin/places/${place.id}`])];
  const blob = new Blob(["\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `srbavayrer-${new Date().toISOString().slice(0, 10)}.csv` });
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function AdminPlaces({ loaderData, actionData }: Route.ComponentProps) {
  const { submissions, places, blocklist, canVisit, canDelete, isOwner } = loaderData;
  const visitedSet = new Set(loaderData.visited);
  const busy = useNavigation().state === "submitting";
  const [filter, setFilter] = useState("");
  const filterInput = useRef<HTMLInputElement>(null);
  // The header's search goes to this page's own filter (places by name, Latin letters too).
  const focusFilter = () => { filterInput.current?.scrollIntoView({ block: "center", behavior: "smooth" }); filterInput.current?.focus({ preventScroll: true }); };
  const [status, setStatus] = useState<"all" | "shown" | "hidden" | "blocked">("all");
  const [kind, setKind] = useState<PlaceKind | "">("");
  const [province, setProvince] = useState("");
  const [been, setBeen] = useState<"all" | "visited" | "unvisited">("all");
  const shown = places.filter((place) =>
    placeMatches(place, filter)
    && (status === "all" || (status === "blocked" ? blockedWords(place.name, blocklist).length > 0 : place.published === (status === "shown")))
    && (!kind || place.kind === kind)
    && (!province || provinceOf(place) === province)
    && (been === "all" || visitedSet.has(place.id) === (been === "visited")));
  const visibleCount = places.filter((place) => place.published).length;
  const kinds = (Object.keys(PLACE_KINDS) as PlaceKind[]).map((id) => ({ id, total: places.filter((place) => place.kind === id).length, visible: places.filter((place) => place.kind === id && place.published).length })).filter((entry) => entry.total > 0);
  const provinces = [...places.reduce((counts, place) => counts.set(provinceOf(place), (counts.get(provinceOf(place)) ?? 0) + 1), new Map<string, number>())]
    .sort(([a], [b]) => (a === "Երևան" ? -1 : b === "Երևան" ? 1 : a.localeCompare(b, "hy")));
  return (
    <PageShell width="admin">
      <SiteNav />
      <PageHeader backTo={isOwner ? "/admin" : "/places"} backLabel={isOwner ? "Կառավարում" : "Քարտեզ"} title="Սրբավայրեր" onSearch={focusFilter} />
      <div className="mt-4 grid gap-5">
        <section className={`${panelSection} grid gap-3`}>
          <h2 className="m-0 text-[17px] font-bold text-ink">Նոր առաջարկներ{submissions.length ? ` (${submissions.length})` : ""}</h2>
          <p className="m-0 text-[13px] text-muted">Ինչ մարդիկ ուղարկել են բոտին /place հրամանով կամ կայքի «Ավելացնել սրբավայր» ձևով։ «Ստեղծել տեղ»-ը նկարները բերում է կայք, տեղը պատրաստում է, բայց չի հրապարակում։</p>
          {submissions.length === 0 ? <p className="m-0 text-[13px] text-faint">Նոր առաջարկ չկա։</p> : null}
          {submissions.map((submission) => (
            <article key={submission.id} className={card}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-[15px] text-ink">{submission.placeName ? `«${submission.placeName}» · ` : ""}{submission.senderName}{submission.fromSite ? " · 🌐 կայքից" : " · ✈️ բոտից"}</strong>
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
              <Form method="post" preventScrollReset className="grid gap-2 min-[560px]:grid-cols-[1fr_auto]">
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

        <BlocklistSection blocklist={blocklist} places={places} busy={busy} canEdit={canDelete} error={actionData?.submissionId === -1 ? actionData.error : ""} />

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
          <div className="grid gap-2 rounded-[16px] border border-glass-border p-3">
            <FilterRow label="Կարգավիճակ">
              {([["all", "Բոլորը"], ["shown", "Ցուցադրված"], ["hidden", "Թաքցված"], ["blocked", "Սև ցուցակով"]] as const).map(([value, label]) => <button key={value} type="button" className={tab(status === value)} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>)}
            </FilterRow>
            <FilterRow label="Տեսակ">
              <button type="button" className={tab(kind === "")} aria-pressed={kind === ""} onClick={() => setKind("")}>Բոլորը</button>
              {kinds.map((entry) => <button key={entry.id} type="button" className={tab(kind === entry.id)} aria-pressed={kind === entry.id} onClick={() => setKind(entry.id)}>{PLACE_KINDS[entry.id]} · {entry.total}</button>)}
            </FilterRow>
            <FilterRow label="Մարզ">
              <button type="button" className={tab(province === "")} aria-pressed={province === ""} onClick={() => setProvince("")}>Բոլորը</button>
              {provinces.map(([name, count]) => <button key={name} type="button" className={tab(province === name)} aria-pressed={province === name} onClick={() => setProvince(name)}>{name} · {count}</button>)}
            </FilterRow>
            {canVisit ? (
              <FilterRow label="Ես">
                {([["all", "Բոլորը"], ["visited", `Եղել եմ · ${visitedSet.size}`], ["unvisited", "Դեռ չեմ եղել"]] as const).map(([value, label]) => <button key={value} type="button" className={tab(been === value)} aria-pressed={been === value} onClick={() => setBeen(value)}>{label}</button>)}
              </FilterRow>
            ) : null}
            <input ref={filterInput} className={fieldControl} type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Փնտրել անունով կամ մարզով (նաև լատինատառ)…" aria-label="Փնտրել տեղերը" />
          </div>
          <ExportPanel places={shown} visited={visitedSet} />
          <div className="grid gap-2">
            {shown.slice(0, 150).map((place) => {
              const blocked = blockedWords(place.name, blocklist);
              return (
              <div key={place.id} className={`frosted-card flex flex-wrap items-center gap-2 p-3 ${blocked.length ? "shadow-[inset_0_0_0_1.5px_rgb(184_72_62/70%)]" : ""}`}>
              <Link className="flex min-w-0 flex-1 basis-[220px] items-center gap-3 text-inherit no-underline" to={`/admin/places/${place.id}`}>
                <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-[#efe3c8]">
                  {place.icon ? <img className="size-full object-contain" src={placeMediaUrl(place.icon)} alt="" /> : place.photos[0] ? <img className="size-full object-cover" src={placeMediaUrl(place.photos[0])} alt="" /> : <MapPin aria-hidden="true" size={20} className="text-faint" />}
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <strong className="truncate text-[14.5px] text-ink">{place.name}</strong>
                  <span className="text-[12px] text-muted">
                    {PLACE_KINDS[place.kind]}{place.region ? ` · ${place.region}` : ""}{place.verified ? "" : " · ⚑ Ճշտել"}{place.icon ? "" : " · գծանկար չկա"}
                  </span>
                  {blocked.length ? <span className="text-[12px] font-semibold text-danger">Սև ցուցակ՝ «{blocked.join("», «")}». կայքում չի երևում</span> : null}
                </span>
              </Link>
              <Form method="post" preventScrollReset className="flex shrink-0 flex-wrap gap-1.5" onSubmit={(event) => {
                const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
                if (submitter?.value === "delete" && !confirm(`Ջնջե՞լ «${place.name}»-ը։ Հետագա ներմուծումը այն այլևս չի բերի։`)) event.preventDefault();
              }}>
                <input type="hidden" name="placeId" value={place.id} />
                {canVisit ? (visitedSet.has(place.id)
                  ? <button className={`${smallButton} text-[#3f8f5a]`} type="submit" name="intent" value="unvisit" disabled={busy} title="Հանել «Եղել եմ»-ը"><Footprints aria-hidden="true" size={15} /> Եղել եմ</button>
                  : <button className={`${smallButton} text-faint`} type="submit" name="intent" value="visit" disabled={busy} title="Նշել «Եղել եմ»"><Footprints aria-hidden="true" size={15} /> Չեմ եղել</button>) : null}
                {place.published
                  ? <button className={`${smallButton} text-[#3f8f5a]`} type="submit" name="intent" value="hide" disabled={busy} title="Թաքցնել քարտեզից"><Eye aria-hidden="true" size={15} /> Ցուցադրված</button>
                  : <button className={`${smallButton} text-faint`} type="submit" name="intent" value="show" disabled={busy} title="Ցուցադրել քարտեզում"><EyeOff aria-hidden="true" size={15} /> Թաքցված</button>}
                {canDelete ? <button className={`${smallButton} text-danger`} type="submit" name="intent" value="delete" disabled={busy} title="Ջնջել" aria-label={`Ջնջել «${place.name}»-ը`}><Trash2 aria-hidden="true" size={15} /></button> : null}
              </Form>
              </div>
              );
            })}
            {shown.length === 0 ? <p className="m-0 text-center text-[13px] text-faint">Այս ֆիլտրով տեղ չկա։</p> : null}
            {shown.length > 150 ? <p className="m-0 text-center text-[12.5px] text-faint">Ցույց է տրված 150-ը {shown.length}-ից. նեղացրեք ֆիլտրը կամ գրեք անունը։ Ներբեռնումը և պատճենումը ներառում են բոլոր {shown.length}-ը։</p> : null}
          </div>
          <Form method="post" preventScrollReset className="grid gap-2 border-t border-glass-border pt-3 min-[560px]:grid-cols-[1fr_1fr_auto]">
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

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 min-[700px]:grid-cols-[96px_1fr] min-[700px]:items-start">
      <span className="pt-2 text-[12px] font-semibold text-faint">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>{children}</div>
    </div>
  );
}

/** The filtered list out of the site: a spreadsheet, or numbered lines copied 50 at a time for a chat with GPT. */
function ExportPanel({ places, visited }: { places: Place[]; visited: Set<string> }) {
  const [copied, setCopied] = useState(-1);
  const copy = async (from: number) => {
    try { await navigator.clipboard.writeText(listText(places.slice(from, from + CHUNK), from)); setCopied(from); window.setTimeout(() => setCopied(-1), 2000); } catch { /* not allowed */ }
  };
  const chunks = Array.from({ length: Math.ceil(places.length / CHUNK) }, (_, index) => index * CHUNK);
  return (
    <div className="grid gap-2 rounded-[16px] border border-[rgb(217_181_111/35%)] bg-[rgb(217_181_111/7%)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-[14px] text-ink">Ցանկը դուրս բերել՝ {places.length} տեղ</strong>
        <button className={smallButton} type="button" disabled={!places.length} onClick={() => downloadCsv(places, visited)}><Download aria-hidden="true" size={15} /> Ներբեռնել (Excel)</button>
      </div>
      {chunks.length ? (
        <>
          <p className="m-0 text-[12.5px] text-muted">Պատճենել {CHUNK}-ական. ամեն մասը առանձին հաղորդագրությամբ։</p>
          <div className="flex flex-wrap gap-1.5">
            {chunks.map((from) => (
              <button key={from} className={smallButton} type="button" onClick={() => void copy(from)}>
                {copied === from ? <Check aria-hidden="true" size={15} className="text-[#3f8f5a]" /> : <ClipboardCopy aria-hidden="true" size={15} />}
                {from + 1}–{Math.min(from + CHUNK, places.length)}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Words that mark another denomination's church: such places never show on the site, and an import skips them. */
function BlocklistSection({ blocklist, places, busy, error, canEdit }: { blocklist: string[]; places: Place[]; busy: boolean; error: string; canEdit: boolean }) {
  const caught = places.filter((place) => blockedWords(place.name, blocklist).length);
  const countFor = (word: string) => places.filter((place) => blockedWords(place.name, [word]).length).length;
  return (
    <section className={`${panelSection} grid gap-3`}>
      <h2 className="m-0 flex items-center gap-2 text-[17px] font-bold text-ink"><Ban aria-hidden="true" size={18} className="text-danger" /> Սև ցուցակ</h2>
      <p className="m-0 text-[13px] text-muted">
        Եթե տեղի անվան մեջ կա այս բառերից մեկը (օր.՝ «Բեթել», «ավետարանական»), այն կայքում չի երևում, նույնիսկ եթե ցուցադրված է, և նոր ներմուծումը այն չի բերի։
        Մեծատառ-փոքրատառը նշանակություն չունի։ Մի ավելացրեք «Կաթողիկե» բառը առանձին. Առաքելական Մայր տաճարներն էլ են այդպես կոչվում։
      </p>
      <div className="flex flex-wrap gap-1.5">
        {blocklist.map((word) => (
          <Form key={word} method="post" className="inline-flex items-center gap-1 rounded-full border border-glass-border bg-subtle py-1 pr-1 pl-3 text-[13px] text-ink">
            <input type="hidden" name="word" value={word} />
            {word}{countFor(word) ? <span className="text-[11.5px] font-semibold text-danger">· {countFor(word)}</span> : null}
            {canEdit ? <button className="grid size-6 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-faint hover:text-danger" type="submit" name="intent" value="block-remove" disabled={busy} aria-label={`Հանել «${word}»-ը`}><X aria-hidden="true" size={14} /></button> : <span className="w-2" />}
          </Form>
        ))}
        {blocklist.length === 0 ? <span className="text-[13px] text-faint">Ցուցակը դատարկ է։</span> : null}
      </div>
      {canEdit ? <Form method="post" preventScrollReset className="flex flex-wrap gap-2">
        <input className={`${fieldControl} min-w-0 flex-1`} name="word" placeholder="Նոր բառ կամ անուն, օր.՝ Բեթել" required minLength={2} maxLength={60} />
        <button className={primaryButton} type="submit" name="intent" value="block-add" disabled={busy}><Plus aria-hidden="true" size={16} /> Ավելացնել</button>
      </Form> : null}
      {error ? <p className="m-0 text-[13px] text-danger">{error}</p> : null}
      {caught.length && canEdit ? (
        <Form method="post" preventScrollReset className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-[rgb(184_72_62/10%)] px-3 py-2.5"
          onSubmit={(event) => { if (!confirm(`Ջնջե՞լ ${caught.length} տեղ, որոնց անունը սև ցուցակում է։\n\n${caught.slice(0, 20).map((place) => `• ${place.name}`).join("\n")}`)) event.preventDefault(); }}>
          <span className="text-[13px] text-ink">Սև ցուցակով բռնված է {caught.length} տեղ (տե՛ս «Սև ցուցակով» ֆիլտրը ներքևում)։</span>
          <button className={`${smallButton} text-danger`} type="submit" name="intent" value="delete-blocked" disabled={busy}><Trash2 aria-hidden="true" size={15} /> Ջնջել բոլորը</button>
        </Form>
      ) : null}
    </section>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}

export async function action(args: Route.ActionArgs) {
  const response = await performAction(args);
  if (response instanceof Response && response.status >= 300 && response.status < 400) await bumpCacheEpoch(env.DB);
  return response;
}
