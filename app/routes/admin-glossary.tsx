import { env } from "cloudflare:workers";
import { BookOpenText, Check, MapPin, Pencil, Plus, Trash2, User, X } from "lucide-react";
import { useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import type { Route } from "./+types/admin-glossary";
import { requirePermission, requireSameOrigin } from "../auth/admin.server";
import { RouteErrorPage } from "../components/error-page";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { fieldControl, fieldHint, panelSection, primaryButton } from "../components/ui-styles";
import { deleteGlossaryTerm, listGlossary, parseForms, saveGlossaryTerm } from "../data/glossary.server";
import { bumpCacheEpoch } from "../data/site-refresh.server";
import { GLOSSARY_KINDS, isGlossaryKind, normalizeWord, type GlossaryKind, type GlossaryTerm } from "../utils/glossary";

export function meta() {
  return [{ title: "Բառարան — Կառավարում" }, { name: "robots", content: "noindex, nofollow" }];
}

// Միայն «Բառարան» իրավունք ունեցողը (և գլխավոր ադմինը)։
export async function loader({ request }: Route.LoaderArgs) {
  await requirePermission(request, env.DB, "glossary").catch((error: unknown) => {
    if (error instanceof Response && (error.status === 401 || error.status === 403)) throw redirect("/");
    throw error;
  });
  return { terms: await listGlossary(env.DB) };
}

export async function action({ request }: Route.ActionArgs) {
  await requirePermission(request, env.DB, "glossary");
  requireSameOrigin(request);
  const form = await request.formData();
  const text = (key: string, limit: number) => String(form.get(key) ?? "").trim().slice(0, limit);
  const id = Number(form.get("id")) || undefined;
  if (form.get("intent") === "delete" && id) {
    await deleteGlossaryTerm(env.DB, id);
  } else {
    const word = text("word", 60);
    const meaning = text("meaning", 600);
    if (word.length < 2 || !meaning) return data({ error: "Գրեք բառը և նրա բացատրությունը։", id: id ?? 0 }, { status: 400 });
    // Նույն բառը երկու անգամ չի կարող լինել։
    const twin = (await listGlossary(env.DB)).find((term) => term.id !== id && normalizeWord(term.word) === normalizeWord(word));
    if (twin) return data({ error: `«${twin.word}» բառն արդեն կա բառարանում։`, id: id ?? 0 }, { status: 409 });
    await saveGlossaryTerm(env.DB, { id, word, forms: parseForms(text("forms", 600)), meaning, note: text("note", 600), verified: form.get("verified") === "on", kind: isGlossaryKind(form.get("kind")) ? form.get("kind") as GlossaryKind : "word" });
  }
  // Կայքի էջերը կվերցնեն թարմ բառարանը։
  await bumpCacheEpoch(env.DB);
  return redirect("/admin/glossary");
}

/** Մեկ բառի ձևը՝ և՛ նորի, և՛ փոփոխության համար։ */
function TermForm({ term, error, onDone, kind }: { term?: GlossaryTerm; error?: string; onDone?: () => void; kind?: GlossaryKind }) {
  const busy = useNavigation().state === "submitting";
  return (
    <Form method="post" preventScrollReset className="grid gap-2.5" onSubmit={() => onDone?.()}>
      {term ? <input type="hidden" name="id" value={term.id} /> : null}
      <label className="grid gap-1 text-[13px] font-semibold text-ink">Բաժինը
        <select className={fieldControl} name="kind" defaultValue={term?.kind ?? kind ?? "word"}>
          {Object.entries(GLOSSARY_KINDS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <div className="grid gap-2.5 min-[620px]:grid-cols-2">
        <label className="grid gap-1 text-[13px] font-semibold text-ink">Բառը<input className={fieldControl} name="word" defaultValue={term?.word} required maxLength={60} placeholder="Օր.՝ ամբարիշտ" /></label>
        <label className="grid gap-1 text-[13px] font-semibold text-ink">Այլ ձևեր (ստորակետով)<input className={fieldControl} name="forms" defaultValue={term?.forms.join(", ")} maxLength={600} placeholder="Օր.՝ ամբարշտաց, ամբարշտութիւն" /></label>
      </div>
      <p className={fieldHint}>Վերջավորությունները (-ը, -ի, -ների…) և դասական ուղղագրությունը («է», «իւ») ինքնաբերաբար են գտնվում։ Այլ ձևերում գրեք միայն այն, ինչ արմատից տարբեր է։</p>
      <label className="grid gap-1 text-[13px] font-semibold text-ink">Բացատրությունը<textarea className={`${fieldControl} min-h-[70px] resize-y`} name="meaning" defaultValue={term?.meaning} required maxLength={600} /></label>
      <label className="grid gap-1 text-[13px] font-semibold text-ink">Նշում (ոչ պարտադիր)<input className={fieldControl} name="note" defaultValue={term?.note} maxLength={600} placeholder="Ծագումը, օրինակ, աղբյուրը" /></label>
      <label className="flex items-center gap-2 text-[13.5px] text-ink"><input type="checkbox" name="verified" defaultChecked={term?.verified} /> Ստուգված է հոգևորականի կողմից (առանց սրա՝ «⚑ Ճշտել»)</label>
      {error ? <p className="m-0 text-[13px] font-semibold text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button className={primaryButton} type="submit" disabled={busy}>{term ? <Check aria-hidden="true" size={16} /> : <Plus aria-hidden="true" size={16} />} {term ? "Պահել" : "Ավելացնել"}</button>
        {onDone ? <button className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[14px] border border-glass-border bg-transparent px-3 text-[13px] text-muted" type="button" onClick={onDone}><X aria-hidden="true" size={15} /> Չեղարկել</button> : null}
      </div>
    </Form>
  );
}

/** Բառարանի կառավարում. ավելացնել, փոխել, ջնջել բառերը։ */
export default function AdminGlossary({ loaderData, actionData }: Route.ComponentProps) {
  const { terms } = loaderData;
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [kind, setKind] = useState<GlossaryKind>("word");
  const busy = useNavigation().state === "submitting";
  const query = normalizeWord(filter.trim());
  const shown = terms.filter((term) => term.kind === kind).filter((term) => !query || normalizeWord(`${term.word} ${term.forms.join(" ")} ${term.meaning}`).includes(query));
  return (
    <PageShell width="admin">
      <SiteNav />
      <PageHeader backTo="/admin" backLabel="Կառավարում" title="Բառարան" />
      <div className="mt-4 grid gap-4">
        <section className={`${panelSection} grid gap-3`}>
          <h2 className="m-0 flex items-center gap-2 text-[17px] font-bold text-ink"><Plus aria-hidden="true" size={18} className="text-gold" /> Նոր բառ</h2>
          <p className="m-0 text-[13px] text-muted">Բառը կնշվի կայքի բոլոր տեքստերում (սաղմոսներ, աղոթքներ, վարքեր…), իսկ սեղմելիս կբացվի բացատրությունը։</p>
          <TermForm key={kind} kind={kind} error={actionData && !actionData.id ? actionData.error : undefined} />
        </section>
        <section className={`${panelSection} grid gap-3`}>
          {/* Բաժիններ՝ բառեր, անձնանուններ, տեղանուններ։ */}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Բառարանի բաժիններ">
            {(Object.keys(GLOSSARY_KINDS) as GlossaryKind[]).map((id) => (
              <button key={id} type="button" role="tab" aria-selected={kind === id} onClick={() => setKind(id)}
                className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-semibold ${kind === id ? "border-[rgb(217_181_111/70%)] bg-[rgb(217_181_111/18%)] text-gold-bright" : "border-glass-border bg-subtle text-muted"}`}>
                {id === "word" ? <BookOpenText aria-hidden="true" size={15} /> : id === "person" ? <User aria-hidden="true" size={15} /> : <MapPin aria-hidden="true" size={15} />}
                {GLOSSARY_KINDS[id]} · {terms.filter((term) => term.kind === id).length}
              </button>
            ))}
          </div>
          <input className={fieldControl} type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Փնտրել բառ կամ բացատրություն…" aria-label="Փնտրել բառարանում" />
          <ul className="m-0 grid list-none gap-2 p-0">
            {shown.map((term) => (
              <li key={term.id} className="frosted-card grid gap-2 p-3">
                {editing === term.id ? <TermForm term={term} error={actionData?.id === term.id ? actionData.error : undefined} onDone={() => setEditing(null)} /> : (
                  <div className="flex items-start gap-3">
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <strong className="font-noto text-[16px] text-gold-bright">{term.word}{term.verified ? <span className="ml-1.5 text-[12px] text-[#3f8f5a]">✓</span> : <span className="ml-1.5 text-[11.5px] font-normal text-muted">⚑ Ճշտել</span>}</strong>
                      <span className="text-[13.5px] leading-snug text-ink">{term.meaning}</span>
                      {term.forms.length ? <span className="text-[12px] text-faint">Ձևեր՝ {term.forms.join(", ")}</span> : null}
                    </div>
                    <button className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-glass-border bg-subtle text-ink" type="button" onClick={() => setEditing(term.id)} aria-label={`Փոխել «${term.word}»-ը`}><Pencil aria-hidden="true" size={15} /></button>
                    <Form method="post" preventScrollReset onSubmit={(event) => { if (!window.confirm(`Ջնջե՞լ «${term.word}»-ը բառարանից։`)) event.preventDefault(); }}>
                      <input type="hidden" name="id" value={term.id} />
                      <button className="grid size-9 cursor-pointer place-items-center rounded-[10px] border border-glass-border bg-subtle text-danger" type="submit" name="intent" value="delete" disabled={busy} aria-label={`Ջնջել «${term.word}»-ը`}><Trash2 aria-hidden="true" size={15} /></button>
                    </Form>
                  </div>
                )}
              </li>
            ))}
            {shown.length === 0 ? <li className="text-center text-[13px] text-faint">Այդպիսի բառ չկա։</li> : null}
          </ul>
        </section>
      </div>
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
