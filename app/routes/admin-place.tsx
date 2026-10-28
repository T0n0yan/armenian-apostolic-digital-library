import { bumpCacheEpoch } from "../data/site-refresh.server";
import { env } from "cloudflare:workers";
import { Check, Copy, ImagePlus, Star, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { data, Form, Link, redirect, useNavigation, useSearchParams } from "react-router";

import type { Route } from "./+types/admin-place";
import { can, requirePermission, requireSameOrigin } from "../auth/admin.server";
import { RouteErrorPage } from "../components/error-page";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { fieldControl, fieldHint, fieldLabel, panelSection, primaryButton } from "../components/ui-styles";
import { deletePlace, getPlace, PLACE_UPLOAD_TYPES, setPlacePictures, storePlaceFile, updatePlace } from "../data/places.server";
import { ACTIVE_LABELS, isPlaceKind, parseCoordinates, PLACE_KINDS, placeMediaUrl } from "../utils/places";

type Bindings = { DB: D1Database; MEDIA: R2Bucket };

/** What the team gives ChatGPT with a church's photo, so every map drawing comes out alike. */
const DRAWING_PROMPT = "Using the attached photo, draw this church as an illustration for a vintage illustrated tourist map of Armenia: black ink pen drawing with fine hatching for shadows, three-quarter view showing the whole building, no people, no trees, no sky, no text, only a thin ground line. Transparent background, PNG, square 1024×1024, the building centered and filling about 85% of the canvas.";

export function meta() {
  return [{ title: "Սրբավայր — Կառավարում" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const admin = await requirePermission(request, env.DB, "places").catch((error: unknown) => {
    if (error instanceof Response && (error.status === 401 || error.status === 403)) throw redirect("/");
    throw error;
  });
  const place = await getPlace(env.DB, params.id);
  if (!place) throw new Response("Not found", { status: 404 });
  return { place, canDelete: can(admin, "places-delete") };
}

async function performAction({ request, params }: Route.ActionArgs) {
  const admin = await requirePermission(request, env.DB, "places");
  requireSameOrigin(request);
  const { DB, MEDIA } = env as unknown as Bindings;
  const place = await getPlace(DB, params.id);
  if (!place) throw new Response("Not found", { status: 404 });
  const form = await request.formData();
  const intent = form.get("intent");
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const files = (key: string) => form.getAll(key).filter((value): value is File => value instanceof File && value.size > 0);

  if (intent === "save") {
    const point = parseCoordinates(text("coordinates"));
    const kind = text("kind");
    if (!text("name") || !point || !isPlaceKind(kind)) return data({ error: "Ստուգեք անունը, տեսակը և կոորդինատները։" }, { status: 400 });
    await updatePlace(DB, place.id, {
      name: text("name"), kind, ...point, region: text("region"), description: text("description"), clergy: text("clergy"),
      services: text("services"), accessibility: text("accessibility"),
      active: ["yes", "no", "renovation"].includes(text("active")) ? text("active") : "", liturgy: text("liturgy"), openHours: text("openHours"), videoUrl: text("videoUrl"), creditName: text("creditName"),
      verified: form.get("verified") === "on", published: form.get("published") === "on",
    });
    return redirect(`/admin/places/${place.id}?saved=1`);
  }
  if (intent === "photos") {
    const added: string[] = [];
    for (const file of files("photos").slice(0, 12)) {
      if (!PLACE_UPLOAD_TYPES.includes(file.type) || file.size > 15_000_000) continue;
      added.push(await storePlaceFile(MEDIA, place.id, "photo", await file.arrayBuffer(), file.type));
    }
    await setPlacePictures(DB, place.id, { photos: [...place.photos, ...added] });
    return redirect(`/admin/places/${place.id}`);
  }
  if (intent === "icon") {
    const [file] = files("icon");
    if (!file || !["image/png", "image/webp"].includes(file.type)) return data({ error: "Գծանկարը պետք է լինի PNG (թափանցիկ ֆոնով)։" }, { status: 400 });
    const key = await storePlaceFile(MEDIA, place.id, "icon", await file.arrayBuffer(), file.type);
    if (place.icon) await MEDIA.delete(place.icon);
    await setPlacePictures(DB, place.id, { icon: key });
    return redirect(`/admin/places/${place.id}`);
  }
  if (intent === "remove-icon" && place.icon) {
    await MEDIA.delete(place.icon);
    await setPlacePictures(DB, place.id, { icon: null });
    return redirect(`/admin/places/${place.id}`);
  }
  if (intent === "cover" || intent === "remove-photo") {
    const key = text("key");
    if (!place.photos.includes(key)) return redirect(`/admin/places/${place.id}`);
    const rest = place.photos.filter((photo) => photo !== key);
    if (intent === "remove-photo") await MEDIA.delete(key);
    await setPlacePictures(DB, place.id, { photos: intent === "cover" ? [key, ...rest] : rest });
    return redirect(`/admin/places/${place.id}`);
  }
  if (intent === "delete") {
    if (!can(admin, "places-delete")) throw new Response("Not allowed.", { status: 403 });
    await deletePlace(DB, MEDIA, place.id);
    return redirect("/admin/places");
  }
  return redirect(`/admin/places/${place.id}`);
}

/**
 * An Armenian «choose file» button (the browser's own reads «Choose File»): picking files sends the
 * form at once.
 */
function UploadButton({ name, intent, accept, multiple, label, icon, disabled }: { name: string; intent: string; accept: string; multiple?: boolean; label: string; icon: React.ReactNode; disabled: boolean }) {
  return (
    <Form method="post" encType="multipart/form-data">
      <input type="hidden" name="intent" value={intent} />
      <label className={`${smallButton} ${disabled ? "opacity-60" : ""}`}>
        {icon} {disabled ? "Վերբեռնվում է…" : label}
        <input className="sr-only" type="file" name={name} accept={accept} multiple={multiple} disabled={disabled}
          onChange={(event) => { if (event.currentTarget.files?.length) event.currentTarget.form?.requestSubmit(); }} />
      </label>
    </Form>
  );
}

const smallButton = "inline-flex min-h-9 w-fit cursor-pointer items-center gap-1.5 rounded-[11px] border border-glass-border bg-subtle px-2.5 text-[12.5px] font-semibold text-ink";
const textarea = `${fieldControl} min-h-[110px] resize-y leading-relaxed`;

/** One place: its text, location, photos, map drawing, and whether it is on the public map. */
export default function AdminPlace({ loaderData, actionData }: Route.ComponentProps) {
  const { place } = loaderData;
  const busy = useNavigation().state === "submitting";
  const [copied, setCopied] = useState(false);
  const saved = useSearchParams()[0].has("saved");
  return (
    <PageShell width="admin">
      <SiteNav />
      <PageHeader backTo="/admin/places" backLabel="Սրբավայրեր" title={place.name} />
      <div className="mt-4 grid gap-5">
        {place.published ? <Link className="w-fit text-[13px] text-gold-bright" to={`/places/${place.id}`}>Բացել կայքում →</Link> : null}

        <Form method="post" className={`${panelSection} grid gap-4`}>
          <label className={fieldLabel}>Անունը<input className={fieldControl} name="name" defaultValue={place.name} required /></label>
          <div className="grid gap-4 min-[560px]:grid-cols-2">
            <label className={fieldLabel}>Տեսակը
              <select className={fieldControl} name="kind" defaultValue={place.kind}>
                {Object.entries(PLACE_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className={fieldLabel}>Մարզ / բնակավայր<input className={fieldControl} name="region" defaultValue={place.region} placeholder="Արմավիրի մարզ, Վաղարշապատ" /></label>
          </div>
          <label className={fieldLabel}>Կոորդինատներ
            <input className={fieldControl} name="coordinates" defaultValue={`${place.latitude}, ${place.longitude}`} required />
            <span className={fieldHint}>«40.1617, 44.2913» կամ Google Maps-ի հղումը։ <a className="text-gold-bright" href={`https://www.google.com/maps?q=${place.latitude},${place.longitude}`} target="_blank" rel="noreferrer">Ստուգել քարտեզում</a></span>
          </label>
          <label className={fieldLabel}>Պատմություն և տեղեկություն<textarea className={textarea} name="description" defaultValue={place.description} rows={6} /></label>
          <label className={fieldLabel}>Գործո՞ղ է
            <select className={fieldControl} name="active" defaultValue={place.active}>
              <option value="">Հայտնի չէ</option>
              {Object.entries(ACTIVE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className={fieldLabel}>Սուրբ Պատարագ<input className={fieldControl} name="liturgy" defaultValue={place.liturgy} placeholder="Կիրակի 11:00" /></label>
          <label className={fieldLabel}>Ժամերգություններ<textarea className={textarea} name="services" defaultValue={place.services} rows={2} placeholder="Երկուշաբթիից շաբաթ 09:30–10:00 և 17:00–17:30" /></label>
          <label className={fieldLabel}>Ծառայողներ (մեկ դեր՝ մեկ տող)<textarea className={textarea} name="clergy" defaultValue={place.clergy} rows={3} placeholder={"Թեմի Առաջնորդ՝ Տեր … Սրբազան\nՔահանա՝ Տեր …, Տեր …\nՍարկավագ՝ …"} /></label>
          <label className={fieldLabel}>Բաց է<input className={fieldControl} name="openHours" defaultValue={place.openHours} placeholder="Ամեն օր 09:00–18:00" /></label>
          <label className={fieldLabel}>Ճանապարհը և մուտքը<textarea className={fieldControl} name="accessibility" rows={2} defaultValue={place.accessibility} placeholder={"Ճանապարհը՝ մեքենայով՝ մինչև եկեղեցի\nՄուտքը՝ մի քանի աստիճան"} /></label>
          <label className={fieldLabel}>Տեսանյութ
            <input className={fieldControl} name="videoUrl" defaultValue={place.videoUrl} placeholder="YouTube-ի հղում (կամ բոտով ուղարկված տեսանյութը)" />
          </label>
          <label className={fieldLabel}>Ուղարկողի անունը (եթե համաձայն է)<input className={fieldControl} name="creditName" defaultValue={place.creditName} /></label>
          <label className="flex items-center gap-2 text-[14px] text-ink"><input type="checkbox" name="verified" defaultChecked={place.verified} /> Տեղեկությունը ստուգված է հոգևորականների կողմից (առանց սրա կայքում երևում է «⚑ Ճշտել»)</label>
          <label className="flex items-center gap-2 text-[14px] font-semibold text-ink"><input type="checkbox" name="published" defaultChecked={place.published} /> Ցույց տալ քարտեզում</label>
          <div className="flex flex-wrap items-center gap-3">
            <button className={primaryButton} type="submit" name="intent" value="save" disabled={busy}><Check aria-hidden="true" size={16} /> Պահել</button>
            {saved ? <span className="text-[13px] text-gold-bright">Պահված է ✓</span> : null}
            {actionData?.error ? <span className="text-[13px] text-danger">{actionData.error}</span> : null}
          </div>
        </Form>

        <section className={`${panelSection} grid gap-3`}>
          <h2 className="m-0 text-[16px] font-bold text-ink">Գծանկար քարտեզի համար</h2>
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid size-28 place-items-center rounded-[14px] bg-[#efe3c8]">
              {place.icon ? <img className="size-24 object-contain" src={placeMediaUrl(place.icon)} alt="" /> : <span className="px-2 text-center text-[12px] text-[#7a5a3a]">Դեռ չկա. քարտեզում կերևա կլոր լուսանկարը</span>}
            </span>
            <div className="grid gap-2">
              <UploadButton name="icon" intent="icon" accept="image/png,image/webp" label={place.icon ? "Փոխել գծանկարը (PNG)" : "Վերբեռնել գծանկարը (PNG)"} icon={<Upload aria-hidden="true" size={14} />} disabled={busy} />
              {place.icon ? <Form method="post"><button className={smallButton} type="submit" name="intent" value="remove-icon" disabled={busy}><Trash2 aria-hidden="true" size={14} /> Հեռացնել գծանկարը</button></Form> : null}
            </div>
          </div>
          <div className="grid gap-2 rounded-[14px] bg-subtle p-3">
            <p className="m-0 text-[13px] leading-relaxed text-muted">Ինչպես ստանալ գծանկարը. բացեք ChatGPT-ն, կցեք եկեղեցու լավ լուսանկարը (ամբողջ շենքը երևա), տեղադրեք այս տեքստը և ուղարկեք։ Ստացված PNG-ն վերբեռնեք վերևում։ Նույն տեքստով բոլոր եկեղեցիները կստացվեն միատեսակ։</p>
            <p className="m-0 select-all rounded-[10px] bg-control p-2.5 font-mono text-[12px] leading-relaxed text-ink">{DRAWING_PROMPT}</p>
            <button className={`${smallButton} w-fit`} type="button" onClick={() => navigator.clipboard?.writeText(DRAWING_PROMPT).then(() => setCopied(true), () => undefined)}>
              {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />} {copied ? "Պատճենվեց" : "Պատճենել տեքստը"}
            </button>
          </div>
        </section>

        <section className={`${panelSection} grid gap-3`}>
          <h2 className="m-0 text-[16px] font-bold text-ink">Լուսանկարներ ({place.photos.length})</h2>
          <p className="m-0 text-[12.5px] text-muted">Առաջինը գլխավորն է. այն երևում է քարտեզի պատուհանում և որպես կլոր նշան, քանի դեռ գծանկար չկա։</p>
          <div className="grid grid-cols-2 gap-2 min-[560px]:grid-cols-4">
            {place.photos.map((key, index) => (
              <figure key={key} className="m-0 grid gap-1.5">
                <img className="aspect-[4/3] w-full rounded-[10px] object-cover" src={placeMediaUrl(key)} alt="" loading="lazy" />
                <Form method="post" className="flex flex-wrap gap-1.5">
                  <input type="hidden" name="key" value={key} />
                  {index > 0 ? <button className={smallButton} type="submit" name="intent" value="cover" disabled={busy}><Star aria-hidden="true" size={13} /> Գլխավոր</button> : <span className="text-[12px] text-gold-bright">★ Գլխավոր</span>}
                  <button className={smallButton} type="submit" name="intent" value="remove-photo" disabled={busy} aria-label="Ջնջել"><Trash2 aria-hidden="true" size={13} /></button>
                </Form>
              </figure>
            ))}
          </div>
          <UploadButton name="photos" intent="photos" accept="image/jpeg,image/png,image/webp" multiple label="Ավելացնել նկարներ" icon={<ImagePlus aria-hidden="true" size={14} />} disabled={busy} />
        </section>

        {loaderData.canDelete ? (
        <Form method="post" className="flex justify-end" onSubmit={(event) => { if (!window.confirm(`Ջնջե՞լ «${place.name}»-ը և նրա բոլոր նկարները։`)) event.preventDefault(); }}>
          <button className={`${smallButton} text-danger`} type="submit" name="intent" value="delete" disabled={busy}><Trash2 aria-hidden="true" size={14} /> Ջնջել տեղը</button>
        </Form>
        ) : null}
      </div>
    </PageShell>
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
