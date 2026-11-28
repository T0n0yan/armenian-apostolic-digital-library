import { env } from "cloudflare:workers";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Form, Link, redirect, useNavigation } from "react-router";

import type { Route } from "./+types/admin-guide";
import { requirePermission, requireSameOrigin } from "../auth/admin.server";
import { guidesAdmin } from "../auth/guides-admin.server";
import { RouteErrorPage } from "../components/error-page";
import { CHURCH_ICONS } from "../components/etiquette-ui";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { fieldControl, fieldHint, fieldLabel, panelSection, primaryButton } from "../components/ui-styles";
import { deleteGuide, getGuide, saveGuide } from "../data/guides.server";
import { BLOCK_PARTS, GUIDE_STATUSES, GUIDE_TAGS, guideInput, guidePath, isGuideSlug, type GuideBlock, type GuideFaq, type GuideStatus, type GuideTag } from "../utils/guides";

export function meta() {
  return [{ title: "Ուղեցույց — Կառավարում" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await guidesAdmin(request);
  const guide = isGuideSlug(params.slug) ? await getGuide(env.DB, params.slug) : null;
  if (!guide) throw redirect("/admin/guides");
  return { guide };
}

export async function action({ request, params }: Route.ActionArgs) {
  const admin = await requirePermission(request, env.DB, "guides");
  requireSameOrigin(request);
  const form = await request.formData();
  if (form.get("intent") === "delete") {
    await deleteGuide(env.DB, params.slug);
    throw redirect("/admin/guides");
  }
  const input = guideInput(form);
  if (!input) return { error: "Վերնագիրը պարտադիր է, հասցեն՝ լատինատառ, թվեր և գծիկ։" };
  const saved = await saveGuide(env.DB, input, admin.email, params.slug);
  if (!saved.ok) return { error: saved.error };
  // Էջերը կարդում են բազայից անմիջապես, որոնումը՝ մինչև 1 րոպե ուշացումով (memory cache)։
  if (input.slug !== params.slug) throw redirect(`/admin/guides/${input.slug}`);
  return { saved: true };
}

const small = "inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full border border-edge bg-subtle px-3 text-[12.5px] font-bold text-ink disabled:opacity-40";
const area = `${fieldControl} min-h-[96px] resize-y leading-relaxed`;
const PART_HINTS: Record<string, string> = { prepare: "Ինչ բերել, ինչպես պատրաստվել", steps: "Ինչ է կատարվում՝ հերթով", prayer: "Աղոթքի կամ արարողության տեքստը", why: "Իմաստը, Սուրբ Գրքի հղում" };

function move<T>(list: T[], index: number, step: number) {
  const next = [...list];
  const target = index + step;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Մեկ ուղեցույցի խմբագիր. բլոկները և ՀՏՀ-ն պահվում են JSON-ով (թաքնված դաշտ)։ */
export default function AdminGuide({ loaderData, actionData }: Route.ComponentProps) {
  const { guide } = loaderData;
  const busy = useNavigation().state !== "idle";
  const [kind, setKind] = useState(guide.kind);
  const [blocks, setBlocks] = useState<GuideBlock[]>(guide.body.blocks);
  const [faq, setFaq] = useState<GuideFaq[]>(guide.body.faq);
  const setBlock = (index: number, patch: Partial<GuideBlock>) => setBlocks((old) => old.map((block, i) => i === index ? { ...block, ...patch } : block));
  const setItem = (index: number, patch: Partial<GuideFaq>) => setFaq((old) => old.map((item, i) => i === index ? { ...item, ...patch } : item));

  return (
    <PageShell>
      <SiteNav />
      <PageHeader showSearch={false} backTo="/admin/guides" backLabel="Ուղեցույցներ" title={guide.title} />
      <Form method="post" className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <input type="hidden" name="body" value={JSON.stringify({ blocks, faq })} />
        <section className={`${panelSection} grid gap-3.5`}>
          <label className={fieldLabel}>Վերնագիր<input className={fieldControl} name="title" defaultValue={guide.title} required maxLength={160} /></label>
          <label className={fieldLabel}>Մեկ տող քարտի համար<input className={fieldControl} name="description" defaultValue={guide.description} maxLength={300} /></label>
          <div className="grid gap-3 min-[560px]:grid-cols-2">
            <label className={fieldLabel}>Կարգավիճակ
              <select className={fieldControl} name="status" defaultValue={guide.status}>
                {(Object.keys(GUIDE_STATUSES) as GuideStatus[]).map((status) => <option key={status} value={status}>{GUIDE_STATUSES[status]}</option>)}
              </select>
            </label>
            <label className={fieldLabel}>Ով է ստուգել (քահանա)<input className={fieldControl} name="verifiedBy" defaultValue={guide.verifiedBy} maxLength={300} placeholder="Տեր …" /></label>
            <label className={fieldLabel}>Տեսակ
              <select className={fieldControl} name="kind" value={kind} onChange={(event) => setKind(event.target.value === "link" ? "link" : "guide")}>
                <option value="guide">Էջ բլոկներով</option>
                <option value="link">Հղում այլ էջի</option>
              </select>
            </label>
            <label className={fieldLabel}>Պատկերակ
              <select className={fieldControl} name="icon" defaultValue={guide.icon}>
                {Object.keys(CHURCH_ICONS).map((icon) => <option key={icon} value={icon}>{icon}</option>)}
              </select>
            </label>
            <label className={fieldLabel}>Հասցե<input className={fieldControl} name="slug" defaultValue={guide.slug} required pattern="[a-z0-9-]{2,40}" /></label>
            <label className={fieldLabel}>Կարգը ցուցակում<input className={fieldControl} name="sort" type="number" min={0} max={9999} defaultValue={guide.sort} /></label>
          </div>
          {kind === "link" ? (
            <label className={fieldLabel}>Ուր է տանում<input className={fieldControl} name="link" defaultValue={guide.link} placeholder="/church/calendar" /></label>
          ) : (
            <label className={fieldLabel}>Ամփոփում (էջի վերևում)<textarea className={area} name="summary" defaultValue={guide.summary} /></label>
          )}
          <label className={fieldLabel}>Աղբյուրներ<textarea className={area} name="sources" defaultValue={guide.sources.join("\n")} /><span className={fieldHint}>Ամեն տողում՝ մեկ աղբյուր (հեղինակ, գիրք, տարի)։</span></label>
        </section>

        {kind === "guide" ? (<>
          <h2 className="m-0 px-1 text-[12px] font-bold tracking-[1.2px] text-gold uppercase">Բլոկներ ({blocks.length})</h2>
          {blocks.map((block, index) => (
            <section key={index} className={`${panelSection} grid gap-3`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <strong className="mr-auto text-[14px] text-muted">{index + 1}</strong>
                <button className={small} type="button" disabled={!index} onClick={() => setBlocks((old) => move(old, index, -1))} aria-label="Վեր"><ArrowUp aria-hidden="true" size={14} /></button>
                <button className={small} type="button" disabled={index === blocks.length - 1} onClick={() => setBlocks((old) => move(old, index, 1))} aria-label="Վար"><ArrowDown aria-hidden="true" size={14} /></button>
                <button className={small} type="button" onClick={() => { if (confirm("Ջնջե՞լ բլոկը")) setBlocks((old) => old.filter((_, i) => i !== index)); }}><Trash2 aria-hidden="true" size={14} />Ջնջել</button>
              </div>
              <label className={fieldLabel}>Վերնագիր<input className={fieldControl} value={block.title} onChange={(event) => setBlock(index, { title: event.target.value })} /></label>
              <div className="grid gap-3 min-[560px]:grid-cols-2">
                <label className={fieldLabel}>Երբ<input className={fieldControl} value={block.when ?? ""} onChange={(event) => setBlock(index, { when: event.target.value })} /></label>
                <label className={fieldLabel}>Պիտակ
                  <select className={fieldControl} value={block.tag ?? ""} onChange={(event) => setBlock(index, { tag: (event.target.value || undefined) as GuideTag | undefined })}>
                    <option value="">Առանց պիտակի</option>
                    {(Object.keys(GUIDE_TAGS) as GuideTag[]).map((tag) => <option key={tag} value={tag}>{GUIDE_TAGS[tag].label}</option>)}
                  </select>
                </label>
              </div>
              <label className={fieldLabel}>Ինչ է<textarea className={area} value={block.text} onChange={(event) => setBlock(index, { text: event.target.value })} /></label>
              {BLOCK_PARTS.map(([key, label]) => (
                <label key={key} className={fieldLabel}>{label}
                  <textarea className={area} value={block[key] ?? ""} onChange={(event) => setBlock(index, { [key]: event.target.value })} placeholder={PART_HINTS[key]} />
                </label>
              ))}
              <label className={fieldLabel}>Խարիսխ (#)<input className={fieldControl} value={block.id} onChange={(event) => setBlock(index, { id: event.target.value.toLowerCase() })} pattern="[a-z0-9-]{1,40}" /><span className={fieldHint}>Լատինատառ. հղումը՝ {guidePath(guide)}#{block.id}</span></label>
            </section>
          ))}
          <button className={`${small} w-fit`} type="button" onClick={() => setBlocks((old) => [...old, { id: `b${old.length + 1}`, title: "", text: "" }])}><Plus aria-hidden="true" size={14} />Ավելացնել բլոկ</button>

          <h2 className="m-0 mt-2 px-1 text-[12px] font-bold tracking-[1.2px] text-gold uppercase">Հաճախ հարցնում են ({faq.length})</h2>
          {faq.map((item, index) => (
            <section key={index} className={`${panelSection} grid gap-3`}>
              <div className="flex items-center gap-1.5">
                <strong className="mr-auto text-[14px] text-muted">{index + 1}</strong>
                <button className={small} type="button" disabled={!index} onClick={() => setFaq((old) => move(old, index, -1))} aria-label="Վեր"><ArrowUp aria-hidden="true" size={14} /></button>
                <button className={small} type="button" onClick={() => setFaq((old) => old.filter((_, i) => i !== index))}><Trash2 aria-hidden="true" size={14} />Ջնջել</button>
              </div>
              <label className={fieldLabel}>Հարց<input className={fieldControl} value={item.q} onChange={(event) => setItem(index, { q: event.target.value })} /></label>
              <label className={fieldLabel}>Պատասխան<textarea className={area} value={item.a} onChange={(event) => setItem(index, { a: event.target.value })} /></label>
            </section>
          ))}
          <button className={`${small} w-fit`} type="button" onClick={() => setFaq((old) => [...old, { q: "", a: "" }])}><Plus aria-hidden="true" size={14} />Ավելացնել հարց</button>
        </>) : null}

        <div className="paper-sheet sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-card p-3">
          <button className={primaryButton} type="submit" name="intent" value="save" disabled={busy}>{busy ? "Պահվում է…" : "Պահել"}</button>
          <Link className="text-[13px] font-semibold text-gold-bright" to={guidePath(guide)}>Դիտել էջը</Link>
          {actionData && "saved" in actionData ? <span className="text-[13px] text-success">✓ Պահված է</span> : null}
          {actionData && "error" in actionData ? <span className="text-[13px] text-danger">{actionData.error}</span> : null}
          <button className={`${small} ml-auto`} type="submit" name="intent" value="delete" formNoValidate onClick={(event) => { if (!confirm(`Ջնջե՞լ «${guide.title}» ուղեցույցը ամբողջությամբ`)) event.preventDefault(); }}><Trash2 aria-hidden="true" size={14} />Ջնջել ուղեցույցը</button>
        </div>
      </Form>
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
