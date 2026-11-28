import { env } from "cloudflare:workers";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";

import type { Route } from "./+types/admin-questions";
import { requirePermission, requireSameOrigin } from "../auth/admin.server";
import { guidesAdmin } from "../auth/guides-admin.server";
import { RouteErrorPage } from "../components/error-page";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { fieldControl, fieldLabel, panelSection, primaryButton } from "../components/ui-styles";
import { deleteQuestion, forgetMiss, listQuestions, saveQuestion, topMisses } from "../data/questions.server";
import { GUIDE_STATUSES, type GuideStatus } from "../utils/guides";
import { isQuestionTopic, QUESTION_TOPICS, type GuideQuestion, type QuestionTopic } from "../utils/questions";

export function meta() {
  return [{ title: "Հարց ու պատասխան — Կառավարում" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await guidesAdmin(request);
  const [questions, misses] = await Promise.all([listQuestions(env.DB, true), topMisses(env.DB)]);
  return { questions, misses };
}

export async function action({ request }: Route.ActionArgs) {
  const admin = await requirePermission(request, env.DB, "guides");
  requireSameOrigin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  const id = Number(form.get("id")) || undefined;
  if (intent === "forget") { await forgetMiss(env.DB, String(form.get("query") ?? "")); return { ok: true }; }
  if (intent === "delete" && id) { await deleteQuestion(env.DB, id); return { ok: true }; }
  const topic = form.get("topic"), status = String(form.get("status"));
  const question = String(form.get("question") ?? "").trim().slice(0, 300);
  const answer = String(form.get("answer") ?? "").trim().slice(0, 8000);
  if (!isQuestionTopic(topic) || !question) return { error: "Թեման և հարցը պարտադիր են։" };
  await saveQuestion(env.DB, {
    id, topic, question, answer, sort: Math.max(0, Math.min(9999, Number(form.get("sort")) || 0)),
    status: (status in GUIDE_STATUSES ? status : "draft") as GuideStatus,
  }, admin.email);
  return { ok: true };
}

const small = "inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full border border-edge bg-subtle px-3 text-[12.5px] font-bold text-ink";
const area = `${fieldControl} min-h-[96px] resize-y leading-relaxed`;

function QuestionForm({ item, prefill = "", onDone }: { item?: GuideQuestion; prefill?: string; onDone?: () => void }) {
  const busy = useNavigation().state !== "idle";
  return (
    <Form method="post" className={`${panelSection} grid gap-3`} onSubmit={() => onDone?.()}>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <div className="grid gap-3 min-[560px]:grid-cols-3">
        <label className={fieldLabel}>Թեմա
          <select className={fieldControl} name="topic" defaultValue={item?.topic ?? "faith"}>
            {(Object.keys(QUESTION_TOPICS) as QuestionTopic[]).map((topic) => <option key={topic} value={topic}>{QUESTION_TOPICS[topic]}</option>)}
          </select>
        </label>
        <label className={fieldLabel}>Կարգավիճակ
          <select className={fieldControl} name="status" defaultValue={item?.status ?? "draft"}>
            {(Object.keys(GUIDE_STATUSES) as GuideStatus[]).map((status) => <option key={status} value={status}>{GUIDE_STATUSES[status]}</option>)}
          </select>
        </label>
        <label className={fieldLabel}>Կարգը<input className={fieldControl} name="sort" type="number" min={0} max={9999} defaultValue={item?.sort ?? 100} /></label>
      </div>
      <label className={fieldLabel}>Հարց<input className={fieldControl} name="question" defaultValue={item?.question ?? prefill} required maxLength={300} /></label>
      <label className={fieldLabel}>Պատասխան<textarea className={area} name="answer" defaultValue={item?.answer ?? ""} /></label>
      <div className="flex flex-wrap gap-2">
        <button className={`${primaryButton} w-fit`} type="submit" name="intent" value="save" disabled={busy}>{item ? "Պահել" : "Ավելացնել"}</button>
        {item ? <button className={small} type="submit" name="intent" value="delete" formNoValidate onClick={(event) => { if (!confirm("Ջնջե՞լ հարցը")) event.preventDefault(); }}><Trash2 aria-hidden="true" size={14} />Ջնջել</button> : null}
      </div>
    </Form>
  );
}

export default function AdminQuestions({ loaderData, actionData }: Route.ComponentProps) {
  const [editing, setEditing] = useState<number | null>(null);
  const [prefill, setPrefill] = useState<string | null>(null);
  return (
    <PageShell>
      <SiteNav />
      <PageHeader showSearch={false} backTo="/admin/guides" backLabel="Կարգեր և վարքեր" title="Հարց ու պատասխան" />
      <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <p className="m-0 px-1 text-[14px] text-muted">Էջը՝ <Link className="text-gold-bright" to="/church/questions">/church/questions</Link>։ «Սևագիր»-ը ընթերցողը չի տեսնում։</p>
        {actionData && "error" in actionData ? <p className="m-0 text-[13px] text-danger">{actionData.error}</p> : null}

        <section className={`${panelSection} grid gap-2`}>
          <h2 className="m-0 text-[16px] font-bold">Ինչ էին փնտրում ու չգտան (90 օր)</h2>
          <p className="m-0 text-[13px] text-muted">Անանուն. պահվում է միայն բառը և օրը։ «Կարգեր» — /church-ի որոնում, «Գրադարան» — կայքի որոնում։</p>
          {loaderData.misses.length ? (
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {loaderData.misses.map((miss) => (
                <li key={`${miss.query}-${miss.source}`} className="flex flex-wrap items-center gap-2 border-t border-edge pt-1.5 text-[14px]">
                  <strong className="min-w-0 flex-1 break-words">{miss.query}</strong>
                  <span className="text-[12px] text-muted">{miss.source === "church" ? "Կարգեր" : "Գրադարան"} · {miss.total} անգամ · {miss.last}</span>
                  <button className={small} type="button" onClick={() => setPrefill(miss.query)}><Plus aria-hidden="true" size={13} />Հարց</button>
                  <Form method="post"><input type="hidden" name="query" value={miss.query} /><button className={small} type="submit" name="intent" value="forget" aria-label="Հեռացնել ցուցակից"><Trash2 aria-hidden="true" size={13} /></button></Form>
                </li>
              ))}
            </ul>
          ) : <p className="m-0 text-[14px]">Դեռ ոչինչ։</p>}
        </section>

        <h2 className="m-0 px-1 text-[12px] font-bold tracking-[1.2px] text-gold uppercase">Նոր հարց</h2>
        <QuestionForm key={prefill ?? "new"} prefill={prefill ?? ""} onDone={() => setPrefill(null)} />

        <h2 className="m-0 px-1 text-[12px] font-bold tracking-[1.2px] text-gold uppercase">Հարցեր ({loaderData.questions.length})</h2>
        {loaderData.questions.map((item) => editing === item.id
          ? <QuestionForm key={item.id} item={item} onDone={() => setEditing(null)} />
          : (
            <button key={item.id} type="button" className={`${panelSection} grid cursor-pointer gap-0.5 !p-3.5 text-left text-inherit`} onClick={() => setEditing(item.id)}>
              <strong className="text-[15px]">{item.question}</strong>
              <span className="text-[12.5px] text-muted">{QUESTION_TOPICS[item.topic]} · {GUIDE_STATUSES[item.status]}</span>
            </button>
          ))}
      </div>
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
