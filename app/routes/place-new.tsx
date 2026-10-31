import { env } from "cloudflare:workers";
import { Check, ImagePlus, LoaderCircle, LocateFixed, LogIn, MapPin, Plus, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { data, Link, useActionData, useNavigation, useSubmit } from "react-router";

import type { Route } from "./+types/place-new";
import { getOptionalTelegramUser, requireSameOriginUserRequest, requireTelegramUser } from "../auth/telegram-user.server";
import { RouteErrorPage } from "../components/error-page";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { fieldControl, fieldHint, panelSection, primaryButton } from "../components/ui-styles";
import { createWebPlace, openWebPlaces } from "../data/place-web.server";
import { readWebPlace, WEB_PHOTO_LIMIT, type WebPlaceErrors } from "../utils/place-web-form";
import { clergyName, CLERGY_RANKS } from "../utils/clergy-titles";
import { findMyPosition, type LocationFailure } from "../utils/my-location";
import { ACTIVE_LABELS, parseCoordinates, PLACE_KINDS, type PlaceKind } from "../utils/places";
import { PLACE_CHOICES } from "../utils/support-relay";

type Bindings = { DB: D1Database; MEDIA: R2Bucket };

export function meta() {
  return [{ title: "Ավելացնել սրբավայր — Հոգևոր ժառանգություն" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getOptionalTelegramUser(request);
  return data(
    { signedIn: Boolean(user), name: user?.displayName ?? "", waiting: user ? await openWebPlaces(env.DB, user.id) : 0 },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const { DB, MEDIA } = env as unknown as Bindings;
  const place = readWebPlace(await request.formData());
  if (Object.keys(place.errors).length) return data({ errors: place.errors, sent: false }, { status: 400 });
  const result = await createWebPlace(DB, MEDIA, user, place);
  if ("error" in result) return data({ errors: { form: result.error } as WebPlaceErrors, sent: false }, { status: 429 });
  return { errors: {} as WebPlaceErrors, sent: true };
}

// The kinds that can be working churches (a chapel or shrine isn't asked about the Liturgy).
const SERVING_KINDS = new Set<PlaceKind>(["church", "monastery", "complex"]);
const PHOTO_SIDE = 1920;

/** A phone photo made lighter before it is sent: at most 1920 px on its long side, as JPEG. */
async function lighter(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

const LOCATION_FAILURES: Record<LocationFailure, string> = {
  denied: "Տեղորոշման թույլտվություն չկա։ Տեղադրեք Google Maps-ի հղումը ներքևում։",
  unavailable: "Չհաջողվեց որոշել տեղը։ Տեղադրեք Google Maps-ի հղումը ներքևում։",
  unsupported: "Այս բրաուզերը չի որոշում տեղը։ Տեղադրեք Google Maps-ի հղումը ներքևում։",
};

/** One numbered block of the form, with its question and an optional note. */
function Step({ number, title, note, required, children }: { number: number; title: string; note?: string; required?: boolean; children: ReactNode }) {
  return (
    <section className={`${panelSection} grid gap-3`}>
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[13px] font-bold text-[#2a1708]">{number}</span>
        <div className="grid gap-0.5">
          <h2 className="m-0 text-[16px] font-bold text-ink">{title}{required ? <span className="text-danger"> *</span> : null}</h2>
          {note ? <p className={fieldHint}>{note}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Buttons that act as one choice (a radio group), the picked one gold. */
function Choices({ name, options, value, onChange }: { name: string; options: Array<[string, string]>; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      <input type="hidden" name={name} value={value} />
      {options.map(([id, label]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(value === id ? "" : id)}
          className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-semibold transition-colors ${value === id ? "border-[rgb(217_181_111/70%)] bg-[rgb(217_181_111/18%)] text-gold-bright" : "border-glass-border bg-subtle text-muted"}`}>
          {value === id ? <Check aria-hidden="true" size={14} strokeWidth={3} /> : null}{label}
        </button>
      ))}
    </div>
  );
}

const problem = (text?: string) => (text ? <p className="m-0 text-[13px] font-semibold text-danger" role="alert">{text}</p> : null);

/**
 * «Ավելացնել սրբավայր»: the bot's /place questions on one page, for readers without Telegram
 * (signed in with Google) as well as with it. It reaches the team the same way; nothing is shown
 * on the map until an admin checks it.
 */
export default function PlaceNew({ loaderData }: Route.ComponentProps) {
  const answer = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const sending = navigation.state !== "idle" && navigation.formMethod === "POST";
  const errors: WebPlaceErrors = answer?.errors ?? {};
  const [kind, setKind] = useState("");
  const [active, setActive] = useState("");
  const [location, setLocation] = useState("");
  const [locating, setLocating] = useState<"idle" | "busy" | LocationFailure>("idle");
  const point = useMemo(() => parseCoordinates(location), [location]);
  const [photos, setPhotos] = useState<Array<{ file: File; url: string }>>([]);
  useEffect(() => () => photos.forEach((photo) => URL.revokeObjectURL(photo.url)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [clergy, setClergy] = useState<Array<{ role: string; name: string }>>([]);
  const [road, setRoad] = useState("");
  const [entrance, setEntrance] = useState("");
  const [credit, setCredit] = useState<"name" | "anonymous">("name");
  const [preparing, setPreparing] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { if (answer) top.current?.scrollIntoView({ behavior: "smooth" }); }, [answer]);

  if (!loaderData.signedIn) {
    return (
      <PageShell>
        <SiteNav />
        <PageHeader backTo="/places" backLabel="Սրբավայրեր" title="Ավելացնել սրբավայր" />
        <section className={`${panelSection} mx-auto mt-4 grid max-w-[520px] justify-items-center gap-3 text-center`}>
          <MapPin aria-hidden="true" size={30} className="text-gold" />
          <p className="m-0 text-[15px] leading-relaxed text-ink">Եկեղեցի կամ սրբավայր ավելացնելու համար մուտք գործեք <strong>Google</strong>-ով կամ <strong>Telegram</strong>-ով։ Այդպես թիմը կկարողանա կապվել Ձեզ հետ, եթե հարց լինի։</p>
          <Link className={primaryButton} to="/saved"><LogIn aria-hidden="true" size={17} /> Մուտք գործել</Link>
        </section>
      </PageShell>
    );
  }

  if (answer?.sent) {
    return (
      <PageShell>
        <SiteNav />
        <PageHeader backTo="/places" backLabel="Սրբավայրեր" title="Շնորհակալություն 🙏" />
        <section className={`${panelSection} mx-auto mt-4 grid max-w-[560px] justify-items-center gap-3 text-center`}>
          <span className="grid size-14 place-items-center rounded-full bg-[rgb(63_143_90/14%)] text-[#3f8f5a]"><Check aria-hidden="true" size={28} strokeWidth={2.6} /></span>
          <p className="m-0 text-[15px] leading-relaxed text-ink">Ուղարկված է։ Թիմը կստուգի տեղեկությունը, և հաստատելուց հետո սրբավայրը կհայտնվի քարտեզում։</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link className={primaryButton} to="/places">Քարտեզ</Link>
            <a className="inline-flex min-h-11 items-center rounded-[14px] border border-[rgb(217_181_111/40%)] px-4 text-[14px] font-semibold text-gold-bright no-underline" href="/places/new">Ավելացնել ևս մեկը</a>
          </div>
        </section>
      </PageShell>
    );
  }

  const locate = async () => {
    setLocating("busy");
    try {
      const here = await findMyPosition();
      setLocation(`${here.latitude.toFixed(6)}, ${here.longitude.toFixed(6)}`);
      setLocating("idle");
    } catch (failure) {
      setLocating((typeof failure === "string" ? failure : "unavailable") as LocationFailure);
    }
  };

  const addPhotos = (files: FileList | null) => {
    const picked = [...(files ?? [])].filter((file) => file.type.startsWith("image/")).slice(0, WEB_PHOTO_LIMIT - photos.length);
    setPhotos([...photos, ...picked.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };

  // The photos go lighter, then the whole form as multipart.
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.delete("photos");
    setPreparing(true);
    for (const photo of photos) {
      const blob = await lighter(photo.file);
      form.append("photos", blob, blob === photo.file ? photo.file.name : "photo.jpg");
    }
    setPreparing(false);
    void submit(form, { method: "post", encType: "multipart/form-data", preventScrollReset: true });
  };

  const serving = SERVING_KINDS.has(kind as PlaceKind);
  return (
    <PageShell>
      <SiteNav />
      <div ref={top} />
      <PageHeader backTo="/places" backLabel="Սրբավայրեր" title="Ավելացնել սրբավայր" />
      <p className="mx-auto mt-1 mb-4 max-w-[600px] text-center text-[14px] leading-relaxed text-muted">
        Պատմեք եկեղեցու, վանքի կամ մատուռի մասին։ Պարտադիր են միայն <span className="text-danger">*</span> նշվածները, մնացածը՝ ինչ գիտեք։ Թիմը կստուգի, հետո այն կհայտնվի քարտեզում։
      </p>
      {errors.form ? <p className="mx-auto mb-3 max-w-[600px] rounded-[14px] bg-[rgb(184_72_62/10%)] px-4 py-3 text-center text-[14px] font-semibold text-danger" role="alert">{errors.form}</p> : null}
      <form method="post" encType="multipart/form-data" onSubmit={send} className="mx-auto grid w-full max-w-[680px] gap-4" noValidate>
        <Step number={1} title="Անունը" required>
          <input className={fieldControl} name="name" placeholder="Օր.՝ Սուրբ Գրիգոր Նարեկացի եկեղեցի" maxLength={120} required />
          {problem(errors.name)}
        </Step>

        <Step number={2} title="Տեսակը" required>
          <Choices name="kind" value={kind} onChange={setKind} options={Object.entries(PLACE_KINDS) as Array<[string, string]>} />
          {problem(errors.kind)}
        </Step>

        <Step number={3} title="Որտեղ է" required note="Եթե հիմա այնտեղ եք, սեղմեք «Ես այնտեղ եմ»։ Կամ բացեք Google Maps-ը, գտեք եկեղեցին, պատճենեք հղումը և տեղադրեք այստեղ։">
          <button type="button" onClick={() => void locate()} disabled={locating === "busy"}
            className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-[14px] border border-[rgb(217_181_111/45%)] bg-[rgb(217_181_111/10%)] px-4 text-[14px] font-semibold text-gold-bright disabled:cursor-wait">
            {locating === "busy" ? <LoaderCircle aria-hidden="true" size={17} className="animate-search-spin" /> : <LocateFixed aria-hidden="true" size={17} />} Ես այնտեղ եմ
          </button>
          {locating !== "idle" && locating !== "busy" ? <p className={fieldHint}>{LOCATION_FAILURES[locating]}</p> : null}
          <input className={fieldControl} name="location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Google Maps-ի հղում կամ 40.1617, 44.2913" />
          {point ? (
            <a className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-[#3f8f5a] no-underline" href={`https://www.google.com/maps?q=${point.latitude},${point.longitude}`} target="_blank" rel="noreferrer">
              <Check aria-hidden="true" size={15} /> Տեղը գտնված է՝ {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)} · ստուգել քարտեզում ↗
            </a>
          ) : null}
          <input className={fieldControl} name="region" placeholder="Մարզ, բնակավայր (եթե չգրեք, կլրացվի ինքնաբերաբար)" maxLength={120} />
          {problem(errors.location)}
        </Step>

        <Step number={4} title="Նկարներ" note={`Մինչև ${WEB_PHOTO_LIMIT} նկար։ Լավագույնն է, երբ ամբողջ շենքը երևում է։`}>
          {photos.length ? (
            <div className="grid grid-cols-3 gap-2 min-[560px]:grid-cols-4">
              {photos.map((photo, index) => (
                <figure key={photo.url} className="relative m-0">
                  <img className="aspect-square w-full rounded-[12px] object-cover" src={photo.url} alt="" />
                  <button type="button" aria-label="Հանել նկարը" onClick={() => { URL.revokeObjectURL(photo.url); setPhotos(photos.filter((_, at) => at !== index)); }}
                    className="absolute top-1 right-1 grid size-7 cursor-pointer place-items-center rounded-full border-0 bg-[rgb(17_8_22/70%)] text-white"><X aria-hidden="true" size={15} /></button>
                </figure>
              ))}
            </div>
          ) : null}
          {photos.length < WEB_PHOTO_LIMIT ? (
            <label className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-[14px] border border-dashed border-[rgb(217_181_111/55%)] px-4 text-[14px] font-semibold text-gold-bright">
              <ImagePlus aria-hidden="true" size={17} /> Ընտրել նկարներ
              <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { addPhotos(event.currentTarget.files); event.currentTarget.value = ""; }} />
            </label>
          ) : null}
          {problem(errors.photos)}
        </Step>

        {serving ? (
          <Step number={5} title="Գործո՞ղ է">
            <Choices name="active" value={active} onChange={setActive} options={Object.entries(ACTIVE_LABELS)} />
            {active === "yes" ? (
              <div className="grid gap-3 border-t border-glass-border pt-3">
                <label className="grid gap-1.5 text-[13.5px] font-semibold text-ink">Սուրբ Պատարագ<input className={fieldControl} name="liturgy" placeholder="Օր.՝ Կիրակի 10:00" maxLength={300} /></label>
                <label className="grid gap-1.5 text-[13.5px] font-semibold text-ink">Ժամերգություններ<input className={fieldControl} name="services" placeholder="Օր.՝ Ամեն օր 09:30 և 17:00" maxLength={500} /></label>
                <div className="grid gap-2">
                  <span className="text-[13.5px] font-semibold text-ink">Ծառայողներ</span>
                  {clergy.map((person, index) => (
                    <div key={index} className="grid gap-1.5 rounded-[14px] bg-subtle p-2.5">
                      <div className="grid gap-2 min-[560px]:grid-cols-[200px_1fr_auto]">
                        <select className={fieldControl} name="clergyRole" value={person.role} onChange={(event) => setClergy(clergy.map((item, at) => (at === index ? { ...item, role: event.target.value } : item)))}>
                          {CLERGY_RANKS.map((rank) => <option key={rank.role} value={rank.role}>{rank.role}</option>)}
                        </select>
                        <input className={fieldControl} name="clergyName" value={person.name} placeholder="Անուն Ազգանուն" maxLength={160}
                          onChange={(event) => setClergy(clergy.map((item, at) => (at === index ? { ...item, name: event.target.value } : item)))} />
                        <button type="button" aria-label="Հանել" onClick={() => setClergy(clergy.filter((_, at) => at !== index))} className="grid size-11 cursor-pointer place-items-center rounded-[12px] border border-glass-border bg-transparent text-faint"><Trash2 aria-hidden="true" size={16} /></button>
                      </div>
                      {person.name.trim() ? <span className="px-1 text-[12.5px] text-muted">Կայքում՝ <strong className="text-ink">{clergyName(person.role, person.name)}</strong></span> : null}
                    </div>
                  ))}
                  <button type="button" onClick={() => setClergy([...clergy, { role: CLERGY_RANKS[6].role, name: "" }])}
                    className="inline-flex min-h-10 w-fit cursor-pointer items-center gap-1.5 rounded-[12px] border border-glass-border bg-subtle px-3 text-[13px] font-semibold text-ink"><Plus aria-hidden="true" size={15} /> Ավելացնել ծառայող</button>
                </div>
              </div>
            ) : null}
          </Step>
        ) : null}

        <Step number={serving ? 6 : 5} title="Այցելություն">
          {active !== "renovation" ? <label className="grid gap-1.5 text-[13.5px] font-semibold text-ink">Բաց է<input className={fieldControl} name="openHours" placeholder="Օր.՝ Ամեն օր 09:00–18:00" maxLength={300} /></label> : null}
          <div className="grid gap-1.5">
            <span className="text-[13.5px] font-semibold text-ink">Ճանապարհը դեպի եկեղեցի</span>
            <Choices name="road" value={road} onChange={setRoad} options={PLACE_CHOICES.access.map(([label]) => [label, label])} />
          </div>
          <div className="grid gap-1.5">
            <span className="text-[13.5px] font-semibold text-ink">Մուտքը</span>
            <Choices name="entrance" value={entrance} onChange={setEntrance} options={PLACE_CHOICES.entrance.map(([label]) => [label, label])} />
          </div>
        </Step>

        <Step number={serving ? 7 : 6} title="Պատմություն և այն, ինչ գիտեք" note="Կառուցման տարին, հիշարժան դեպքեր, խաչքարեր, ավանդություններ։">
          <textarea className={`${fieldControl} min-h-[140px] resize-y leading-relaxed`} name="notes" maxLength={1500} />
        </Step>

        <Step number={serving ? 8 : 7} title="Ձեր անունը կայքում">
          <Choices name="credit" value={credit} onChange={(value) => setCredit((value || "name") as "name" | "anonymous")} options={[["name", "Նշել իմ անունը"], ["anonymous", "Անանուն"]]} />
          {credit === "name" ? <input className={fieldControl} name="creditName" defaultValue={loaderData.name} maxLength={80} placeholder="Անունը, ինչպես երևա կայքում" /> : null}
        </Step>

        <button className={`${primaryButton} min-h-12 justify-self-center px-8 text-[15px]`} type="submit" disabled={sending || preparing}>
          {sending || preparing ? <LoaderCircle aria-hidden="true" size={18} className="animate-search-spin" /> : <Send aria-hidden="true" size={18} />}
          {preparing ? "Պատրաստում եմ նկարները…" : sending ? "Ուղարկվում է…" : "Ուղարկել"}
        </button>
        {loaderData.waiting ? <p className="m-0 text-center text-[12.5px] text-faint">Ձեր ուղարկածներից {loaderData.waiting}-ը դեռ դիտվում է թիմի կողմից։</p> : null}
      </form>
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
