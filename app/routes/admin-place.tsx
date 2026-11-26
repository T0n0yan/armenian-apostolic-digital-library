import { bumpCacheEpoch } from "../data/site-refresh.server";
import { env } from "cloudflare:workers";
import { Check, Copy, Download, ImagePlus, RefreshCw, Star, Trash2, Upload, Video } from "lucide-react";
import { useState } from "react";
import { data, Form, Link, redirect, useNavigation, useRevalidator, useSearchParams, useSubmit } from "react-router";

import type { Route } from "./+types/admin-place";
import { can, requirePermission, requireSameOrigin } from "../auth/admin.server";
import { RouteErrorPage } from "../components/error-page";
import { RichTextField } from "../components/rich-text";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { fieldControl, fieldHint, fieldLabel, panelSection, primaryButton } from "../components/ui-styles";
import { deletePlace, getPlace, setPlacePictures, storePlaceFile, updatePlace } from "../data/places.server";
import { sniffImageType } from "../utils/image-magic";
import { convertPlacePhotos, oldPhotos, photoName, toWebp } from "../utils/image-webp";
import { AccessField, ScheduleField } from "../components/place-schedule";
import { addServant } from "../utils/place-answers";
import { CLERGY_RANKS, clergyName, formatClergy } from "../utils/clergy-titles";
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
      name: text("name"), kind, ...point, region: text("region"), description: text("description"), clergy: formatClergy(text("clergy")),
      services: text("services"), accessibility: text("accessibility"),
      active: ["yes", "no", "renovation"].includes(text("active")) ? text("active") : "", liturgy: text("liturgy"), openHours: text("openHours"), videoUrl: text("videoUrl"), creditName: text("creditName"),
      verified: form.get("verified") === "on", published: form.get("published") === "on",
    });
    return redirect(`/admin/places/${place.id}?saved=1`);
  }
  if (intent === "photos") {
    const added: string[] = [];
    for (const file of files("photos").slice(0, 12)) {
      if (file.size > 15_000_000) continue;
      const buffer = await file.arrayBuffer();
      const type = sniffImageType(new Uint8Array(buffer)); // իսկական տեսակը, ոչ հաճախորդի MIME-ը (A-11/A-17)
      if (!type) continue;
      added.push(await storePlaceFile(MEDIA, place.id, "photo", buffer, type));
    }
    await setPlacePictures(DB, place.id, { photos: [...place.photos, ...added] });
    return redirect(`/admin/places/${place.id}`);
  }
  // Հին նկարը փոխարինվում է իր WebP տարբերակով՝ նույն տեղում (հերթականությունը, գլխավորը մնում են)։
  if (intent === "replace-photo") {
    const key = text("key");
    const file = files("photo")[0];
    if (!place.photos.includes(key) || !file || file.size > 15_000_000) return data({ error: "Նկարը չհաջողվեց փոխարինել։" }, { status: 400 });
    const buffer = await file.arrayBuffer();
    const type = sniffImageType(new Uint8Array(buffer));
    if (type !== "image/webp" && type !== "image/jpeg") return data({ error: "Նկարը չհաջողվեց փոխարինել։" }, { status: 400 });
    const fresh = await storePlaceFile(MEDIA, place.id, "photo", buffer, type);
    await setPlacePictures(DB, place.id, { photos: place.photos.map((photo) => photo === key ? fresh : photo) });
    await MEDIA.delete(key);
    return data({ error: "" });
  }
  if (intent === "icon") {
    const [file] = files("icon");
    if (!file || file.size > 5_000_000) return data({ error: "Գծանկարը պետք է լինի PNG/WebP, մինչև 5 ՄԲ։" }, { status: 400 });
    const buffer = await file.arrayBuffer();
    const type = sniffImageType(new Uint8Array(buffer));
    if (type !== "image/png" && type !== "image/webp") return data({ error: "Գծանկարը պետք է լինի PNG (թափանցիկ ֆոնով) կամ WebP։" }, { status: 400 });
    const key = await storePlaceFile(MEDIA, place.id, "icon", buffer, type);
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
  if (intent === "remove-video") {
    if (place.videoUrl.startsWith("places/")) await MEDIA.delete(place.videoUrl);
    await setPlacePictures(DB, place.id, { videoUrl: "" });
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
    <Form method="post" preventScrollReset encType="multipart/form-data">
      <input type="hidden" name="intent" value={intent} />
      <label className={`${smallButton} ${disabled ? "opacity-60" : ""}`}>
        {icon} {disabled ? "Վերբեռնվում է…" : label}
        <input className="sr-only" type="file" name={name} accept={accept} multiple={multiple} disabled={disabled}
          onChange={(event) => { if (event.currentTarget.files?.length) event.currentTarget.form?.requestSubmit(); }} />
      </label>
    </Form>
  );
}

/**
 * A video from the phone: sent as the request body itself (so the Worker streams it into storage),
 * with a progress bar; the page reloads its data once it is in.
 */
function VideoUpload({ placeId, hasVideo }: { placeId: string; hasVideo: boolean }) {
  const revalidator = useRevalidator();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const upload = (file: File) => {
    setError("");
    if (file.size > 95_000_000) { setError("Տեսանյութը շատ մեծ է (առավելագույնը 95 ՄԲ)։ Կարճեցրեք կամ սեղմեք այն հեռախոսում։"); return; }
    const request = new XMLHttpRequest();
    request.open("POST", `/admin/places/${placeId}/video`);
    request.setRequestHeader("content-type", file.type || "video/mp4");
    request.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(event.loaded / event.total); };
    request.onload = () => {
      setProgress(null);
      if (request.status >= 200 && request.status < 300) { void revalidator.revalidate(); return; }
      try { setError((JSON.parse(request.responseText) as { error?: string }).error ?? "Չհաջողվեց վերբեռնել։"); } catch { setError("Չհաջողվեց վերբեռնել։"); }
    };
    request.onerror = () => { setProgress(null); setError("Կապը ընդհատվեց։ Փորձեք նորից։"); };
    setProgress(0);
    request.send(file);
  };
  return (
    <div className="grid gap-1.5">
      <label className={`${smallButton} ${progress !== null ? "opacity-70" : ""}`}>
        <Video aria-hidden="true" size={14} /> {progress !== null ? `Վերբեռնվում է… ${Math.round(progress * 100)}%` : hasVideo ? "Փոխել տեսանյութը" : "Ավելացնել տեսանյութ"}
        <input className="sr-only" type="file" accept="video/mp4,video/quicktime,video/webm" disabled={progress !== null}
          onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) upload(file); }} />
      </label>
      {progress !== null ? <span className="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-subtle"><span className="block h-full bg-[linear-gradient(90deg,#b07d2e,#e2c27e)]" style={{ width: `${Math.round(progress * 100)}%` }} /></span> : null}
      {error ? <span className="text-[12.5px] text-danger">{error}</span> : null}
    </div>
  );
}

const smallButton = "inline-flex min-h-9 w-fit cursor-pointer items-center gap-1.5 rounded-control border border-edge bg-subtle px-2.5 text-[12.5px] font-semibold text-ink";
const textarea = `${fieldControl} min-h-[110px] resize-y leading-relaxed`;

/** Նկարների վերբեռնում. ամեն նկար բրաուզերում դառնում է WebP, հետո միայն ուղարկվում։ */
function PhotoUpload({ disabled }: { disabled: boolean }) {
  const submit = useSubmit();
  const [preparing, setPreparing] = useState(false);
  const pick = async (list: FileList | null) => {
    const picked = [...(list ?? [])].slice(0, 12);
    if (!picked.length) return;
    setPreparing(true);
    const form = new FormData();
    form.set("intent", "photos");
    for (const file of picked) {
      const blob = await toWebp(file);
      form.append("photos", blob, blob === file ? file.name : photoName(blob));
    }
    setPreparing(false);
    void submit(form, { method: "post", encType: "multipart/form-data", preventScrollReset: true });
  };
  const off = disabled || preparing;
  return (
    <label className={`${smallButton} ${off ? "opacity-60" : ""}`}>
      <ImagePlus aria-hidden="true" size={14} /> {preparing ? "Պատրաստվում է…" : disabled ? "Վերբեռնվում է…" : "Ավելացնել նկարներ"}
      <input className="sr-only" type="file" accept="image/*" multiple disabled={off}
        onChange={(event) => { const list = event.currentTarget.files; void pick(list).finally(() => { event.currentTarget.value = ""; }); }} />
    </label>
  );
}

/**
 * Մեկ նկարը փոխարինել. ադմինը ներբեռնում է, մաքրում/խմբագրում իր մոտ և նորից վերբեռնում։
 * Նոր նկարը մնում է նույն տեղում (հերթականությունը և գլխավորը չեն փոխվում), հինը ջնջվում է։
 */
function ReplacePhoto({ photoKey, disabled }: { photoKey: string; disabled: boolean }) {
  const submit = useSubmit();
  const [preparing, setPreparing] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    const blob = await toWebp(file);
    const form = new FormData();
    form.set("intent", "replace-photo");
    form.set("key", photoKey);
    form.set("photo", blob, blob === file ? file.name : photoName(blob));
    setPreparing(false);
    void submit(form, { method: "post", encType: "multipart/form-data", preventScrollReset: true });
  };
  const off = disabled || preparing;
  return (
    <label className={`${smallButton} ${off ? "opacity-60" : ""}`}>
      <RefreshCw aria-hidden="true" size={13} /> {preparing ? "Պատրաստվում է…" : "Փոխարինել"}
      <input className="sr-only" type="file" accept="image/*" disabled={off}
        onChange={(event) => { const input = event.currentTarget; void pick(input.files?.[0]).finally(() => { input.value = ""; }); }} />
    </label>
  );
}

/** Հին նկարները WebP դարձնելու կոճակ (մանրամասները՝ `convertPlacePhotos`)։ */
function ConvertPhotos({ placeId, photos }: { placeId: string; photos: string[] }) {
  const revalidator = useRevalidator();
  const [progress, setProgress] = useState<string | null>(null);
  const old = oldPhotos(photos);
  if (!old.length && progress === null) return null;
  const working = progress !== null && !progress.startsWith("Պատրաստ");
  const run = async () => {
    const failed = await convertPlacePhotos(placeId, old, placeMediaUrl, (index) => setProgress(`${index + 1} / ${old.length}`));
    setProgress(failed ? `Պատրաստ է, ${failed} նկար չհաջողվեց` : "Պատրաստ է");
    void revalidator.revalidate();
  };
  return (
    <button className={smallButton} type="button" disabled={working || !old.length} onClick={() => void run()}>
      <Upload aria-hidden="true" size={14} /> {progress ?? `Դարձնել WebP (${old.length} նկար)`}
    </button>
  );
}

/** One place: its text, location, photos, map drawing, and whether it is on the public map. */
/**
 * Ծառայողներ. դերն ընտրելով և անուն-ազգանունը գրելով կայքը ինքն է դնում ճիշտ դիմելաձևը
 * («Սարկավագ» + «Կարեն Առաքելյան» → «Բարեշնորհ Կարեն սրկ. Առաքելյան»)։ Տեքստը կարելի է նաև
 * ձեռքով գրել. պահելիս ծանոթ դերերի տողերը նույնպես ձևավորվում են (formatClergy)։
 */
function ClergyField({ initial }: { initial: string }) {
  const [clergy, setClergy] = useState(initial);
  const [role, setRole] = useState<string>(CLERGY_RANKS[7].role);
  const [name, setName] = useState("");
  const add = () => {
    if (!name.trim()) return;
    setClergy(addServant(clergy.trim(), role, name));
    setName("");
  };
  return (
    <div className={fieldLabel}>
      Ծառայողներ (մեկ դեր՝ մեկ տող)
      <div className="grid gap-2 rounded-control border border-edge bg-subtle p-2.5">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 max-[480px]:grid-cols-1">
          <select className={fieldControl} value={role} onChange={(event) => setRole(event.target.value)} aria-label="Աստիճան">
            {CLERGY_RANKS.map((rank) => <option key={rank.role} value={rank.role}>{rank.role}</option>)}
          </select>
          <input className={fieldControl} value={name} placeholder="Անուն Ազգանուն" maxLength={160} aria-label="Անուն Ազգանուն"
            onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
        </div>
        {name.trim() ? <span className="px-1 text-[12.5px] text-muted">Կայքում՝ <strong className="text-ink">{clergyName(role, name)}</strong></span> : null}
        <button type="button" onClick={add} disabled={!name.trim()} className="min-h-10 cursor-pointer rounded-control border border-[rgb(217_181_111/45%)] bg-[rgb(217_181_111/10%)] px-3 text-[13.5px] font-semibold text-gold-bright disabled:cursor-default disabled:opacity-50">+ Ավելացնել ծառայող</button>
      </div>
      <textarea className={textarea} name="clergy" value={clergy} onChange={(event) => setClergy(event.target.value)} rows={3} placeholder={"Թեմի Առաջնորդ՝ Գերաշնորհ Տ. … արք. …\nԾիսակատար քահանա՝ Արժանապատիվ Տ. … քհն. …\nՍարկավագ՝ Բարեշնորհ … սրկ. …"} />
      <span className={fieldHint}>Ձեռքով գրելիս էլ բավական է «Սարկավագ՝ Կարեն Առաքելյան». պահելիս դիմելաձևը կավելանա։</span>
    </div>
  );
}

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
        <div className="flex flex-wrap gap-4">
          {place.published ? <Link className="w-fit text-[13px] text-gold-bright" to={`/places/${place.id}`}>Բացել կայքում →</Link> : null}
          <Link className="w-fit text-[13px] text-gold-bright" to={`/admin/places/${place.id}/3d`}>3D մոդել →</Link>
        </div>

        <Form method="post" preventScrollReset className={`${panelSection} grid gap-4`}>
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
          <div className={fieldLabel}>Պատմություն և տեղեկություն<RichTextField className={textarea} name="description" defaultValue={place.description} /></div>
          <label className={fieldLabel}>Գործո՞ղ է
            <select className={fieldControl} name="active" defaultValue={place.active}>
              <option value="">Հայտնի չէ</option>
              {Object.entries(ACTIVE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <ScheduleField key={`l${place.liturgy}`} name="liturgy" label="Սուրբ Պատարագ" kind="liturgy" initial={place.liturgy} />
          <ScheduleField key={`s${place.services}`} name="services" label="Ժամերգություններ" kind="services" initial={place.services} />
          <ClergyField key={place.clergy} initial={place.clergy} />
          <ScheduleField key={`h${place.openHours}`} name="openHours" label="Բաց է" kind="hours" initial={place.openHours} />
          <AccessField key={`a${place.accessibility}`} initial={place.accessibility} />
          {/* An uploaded video (from the phone, below with the photos) keeps its key here; otherwise a YouTube link. */}
          {place.videoUrl.startsWith("places/") ? <input type="hidden" name="videoUrl" value={place.videoUrl} /> : (
            <label className={fieldLabel}>Տեսանյութի հղում (YouTube)
              <input className={fieldControl} name="videoUrl" defaultValue={place.videoUrl} placeholder="https://youtu.be/… · կամ վերբեռնեք հեռախոսից՝ ներքևում «Լուսանկարներ և տեսանյութ»" />
            </label>
          )}
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
            <span className="grid size-28 place-items-center rounded-button bg-[#efe3c8]">
              {place.icon ? <img className="size-24 object-contain" src={placeMediaUrl(place.icon)} alt="" /> : <span className="px-2 text-center text-[12px] text-[#7a5a3a]">Դեռ չկա. քարտեզում կերևա կլոր լուսանկարը</span>}
            </span>
            <div className="grid gap-2">
              <UploadButton name="icon" intent="icon" accept="image/png,image/webp" label={place.icon ? "Փոխել գծանկարը (PNG)" : "Վերբեռնել գծանկարը (PNG)"} icon={<Upload aria-hidden="true" size={14} />} disabled={busy} />
              {place.icon ? <Form method="post" preventScrollReset><button className={smallButton} type="submit" name="intent" value="remove-icon" disabled={busy}><Trash2 aria-hidden="true" size={14} /> Հեռացնել գծանկարը</button></Form> : null}
            </div>
          </div>
          <div className="grid gap-2 rounded-button bg-subtle p-3">
            <p className="m-0 text-[13px] leading-relaxed text-muted">Ինչպես ստանալ գծանկարը. բացեք ChatGPT-ն, կցեք եկեղեցու լավ լուսանկարը (ամբողջ շենքը երևա), տեղադրեք այս տեքստը և ուղարկեք։ Ստացված PNG-ն վերբեռնեք վերևում։ Նույն տեքստով բոլոր եկեղեցիները կստացվեն միատեսակ։</p>
            <p className="m-0 select-all rounded-control bg-control p-2.5 font-mono text-[12px] leading-relaxed text-ink">{DRAWING_PROMPT}</p>
            <button className={`${smallButton} w-fit`} type="button" onClick={() => navigator.clipboard?.writeText(DRAWING_PROMPT).then(() => setCopied(true), () => undefined)}>
              {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />} {copied ? "Պատճենվեց" : "Պատճենել տեքստը"}
            </button>
          </div>
        </section>

        <section className={`${panelSection} grid gap-3`}>
          <h2 className="m-0 text-[16px] font-bold text-ink">Լուսանկարներ ({place.photos.length}) և տեսանյութ</h2>
          <p className="m-0 text-[12.5px] text-muted">Առաջինը գլխավորն է. այն երևում է քարտեզի պատուհանում և որպես կլոր նշան, քանի դեռ գծանկար չկա։</p>
          <div className="grid grid-cols-2 gap-2 min-[560px]:grid-cols-4">
            {place.photos.map((key, index) => (
              <figure key={key} className="m-0 grid gap-1.5">
                <img className="aspect-[4/3] w-full rounded-control object-cover" src={placeMediaUrl(key)} alt="" loading="lazy" />
                <Form method="post" preventScrollReset className="flex flex-wrap gap-1.5">
                  <input type="hidden" name="key" value={key} />
                  {index > 0 ? <button className={smallButton} type="submit" name="intent" value="cover" disabled={busy}><Star aria-hidden="true" size={13} /> Գլխավոր</button> : <span className="text-[12px] text-gold-bright">★ Գլխավոր</span>}
                  <button className={smallButton} type="submit" name="intent" value="remove-photo" disabled={busy} aria-label="Ջնջել"><Trash2 aria-hidden="true" size={13} /></button>
                </Form>
                <div className="flex flex-wrap gap-1.5">
                  <a className={smallButton} href={placeMediaUrl(key)} download={`${place.id}-${index + 1}${key.slice(key.lastIndexOf("."))}`}><Download aria-hidden="true" size={13} /> Ներբեռնել</a>
                  <ReplacePhoto photoKey={key} disabled={busy} />
                </div>
              </figure>
            ))}
          </div>
          {actionData?.error ? <span className="text-[13px] text-danger">{actionData.error}</span> : null}
          <div className="flex flex-wrap gap-2">
            <PhotoUpload disabled={busy} />
            <ConvertPhotos placeId={place.id} photos={place.photos} />
            <VideoUpload placeId={place.id} hasVideo={place.videoUrl.startsWith("places/")} />
          </div>
          {place.videoUrl.startsWith("places/") ? (
            <figure className="m-0 grid max-w-[360px] gap-1.5">
              <video className="w-full rounded-control bg-black" src={placeMediaUrl(place.videoUrl)} controls preload="metadata" playsInline />
              <Form method="post" preventScrollReset onSubmit={(event) => { if (!window.confirm("Ջնջե՞լ տեսանյութը։")) event.preventDefault(); }}>
                <button className={smallButton} type="submit" name="intent" value="remove-video" disabled={busy}><Trash2 aria-hidden="true" size={13} /> Ջնջել տեսանյութը</button>
              </Form>
            </figure>
          ) : null}
        </section>

        {loaderData.canDelete ? (
        <Form method="post" preventScrollReset className="flex justify-end" onSubmit={(event) => { if (!window.confirm(`Ջնջե՞լ «${place.name}»-ը և նրա բոլոր նկարները։`)) event.preventDefault(); }}>
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
