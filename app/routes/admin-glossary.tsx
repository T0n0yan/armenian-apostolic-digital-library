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
import { TermForm } from "../components/glossary-term-form";
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
  // Տեքստից ավելացնելիս (glossary-term-sheet) էջը չի փոխվում։
  if (form.get("stay") === "1") return data({ ok: true as const, error: undefined, id: 0 });
  return redirect("/admin/glossary");
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
                className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-semibold ${kind === id ? "border-[rgb(217_181_111/70%)] bg-[rgb(217_181_111/18%)] text-gold-bright" : "border-edge bg-subtle text-muted"}`}>
                {id === "word" ? <BookOpenText aria-hidden="true" size={15} /> : id === "person" ? <User aria-hidden="true" size={15} /> : <MapPin aria-hidden="true" size={15} />}
                {GLOSSARY_KINDS[id]} · {terms.filter((term) => term.kind === id).length}
              </button>
            ))}
          </div>
          <input className={fieldControl} type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Փնտրել բառ կամ բացատրություն…" aria-label="Փնտրել բառարանում" />
          <ul className="m-0 grid list-none gap-2 p-0">
            {shown.map((term) => (
              <li key={term.id} className="paper-card grid gap-2 p-3">
                {editing === term.id ? <TermForm term={term} error={actionData?.id === term.id ? actionData.error : undefined} onDone={() => setEditing(null)} /> : (
                  <div className="flex items-start gap-3">
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <strong className="font-noto text-[16px] text-gold-bright">{term.word}{term.verified ? <span className="ml-1.5 text-[12px] text-[#3f8f5a]">✓</span> : <span className="ml-1.5 text-[11.5px] font-normal text-muted">⚑ Ճշտել</span>}</strong>
                      <span className="text-[13.5px] leading-snug text-ink">{term.meaning}</span>
                      {term.forms.length ? <span className="text-[12px] text-faint">Ձևեր՝ {term.forms.join(", ")}</span> : null}
                    </div>
                    <button className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-control border border-edge bg-subtle text-ink" type="button" onClick={() => setEditing(term.id)} aria-label={`Փոխել «${term.word}»-ը`}><Pencil aria-hidden="true" size={15} /></button>
                    <Form method="post" preventScrollReset onSubmit={(event) => { if (!window.confirm(`Ջնջե՞լ «${term.word}»-ը բառարանից։`)) event.preventDefault(); }}>
                      <input type="hidden" name="id" value={term.id} />
                      <button className="grid size-9 cursor-pointer place-items-center rounded-control border border-edge bg-subtle text-danger" type="submit" name="intent" value="delete" disabled={busy} aria-label={`Ջնջել «${term.word}»-ը`}><Trash2 aria-hidden="true" size={15} /></button>
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
