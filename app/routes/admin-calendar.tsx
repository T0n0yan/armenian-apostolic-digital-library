import { env } from "cloudflare:workers";
import { EyeOff, Plus, Trash2 } from "lucide-react";
import { Form, Link, useNavigation } from "react-router";

import type { Route } from "./+types/admin-calendar";
import { requirePermission, requireSameOrigin } from "../auth/admin.server";
import { guidesAdmin } from "../auth/guides-admin.server";
import { RouteErrorPage } from "../components/error-page";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { fieldControl, fieldLabel, panelSection, primaryButton } from "../components/ui-styles";
import { addOverride, deleteOverride, listOverrides } from "../data/calendar.server";
import { CALENDAR_KINDS, computedFeasts, dayMonth, isCalendarKind, type CalendarKind } from "../utils/church-calendar";
import { yerevanDay } from "../utils/liturgy";

export function meta() {
  return [{ title: "Տոնացույց — Կառավարում" }, { name: "robots", content: "noindex, nofollow" }];
}

const yearOf = (request: Request) => {
  const asked = Number(new URL(request.url).searchParams.get("year"));
  return Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : Number(yerevanDay().slice(0, 4));
};

export async function loader({ request }: Route.LoaderArgs) {
  await guidesAdmin(request);
  const year = yearOf(request);
  return { year, computed: computedFeasts(year), overrides: await listOverrides(env.DB, year) };
}

export async function action({ request }: Route.ActionArgs) {
  const admin = await requirePermission(request, env.DB, "guides");
  requireSameOrigin(request);
  const form = await request.formData();
  if (form.get("intent") === "delete") { await deleteOverride(env.DB, Number(form.get("id"))); return { ok: true }; }
  const day = String(form.get("day") ?? ""), title = String(form.get("title") ?? "").trim().slice(0, 200), kind = form.get("kind");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day) || !title || !isCalendarKind(kind)) return { error: "Օրը, վերնագիրը և տեսակը պարտադիր են։" };
  await addOverride(env.DB, { day, title, kind, hide: form.get("intent") === "hide" }, admin.email);
  return { ok: true };
}

const small = "inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full border border-edge bg-subtle px-3 text-[12.5px] font-bold text-ink";

/** Տոնացույցի ուղղումներ. հաշվարկվածը թաքցնել, նորը ավելացնել (սրբերի տոներ, տարբերություններ)։ */
export default function AdminCalendar({ loaderData, actionData }: Route.ComponentProps) {
  const { year, computed, overrides } = loaderData;
  const busy = useNavigation().state !== "idle";
  const hidden = new Set(overrides.filter((item) => item.hide).map((item) => `${item.day}|${item.title}`));
  return (
    <PageShell>
      <SiteNav />
      <PageHeader showSearch={false} backTo="/admin/guides" backLabel="Կարգեր և վարքեր" title={`Տոնացույց ${year}`} />
      <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <p className="m-0 px-1 text-[14px] leading-relaxed text-muted">
          Տոները հաշվարկվում են Զատկից։ Համեմատեք Մայր Աթոռի {year} թ. տոնացույցի հետ՝ սխալը թաքցրեք, պակասը ավելացրեք։
          Էջը՝ <Link className="text-gold-bright" to={`/church/calendar?year=${year}`}>/church/calendar</Link> ·{" "}
          <Link className="text-gold-bright" to={`?year=${year - 1}`}>{year - 1}</Link> · <Link className="text-gold-bright" to={`?year=${year + 1}`}>{year + 1}</Link>
        </p>
        {actionData && "error" in actionData ? <p className="m-0 text-[13px] text-danger">{actionData.error}</p> : null}

        <Form method="post" className={`${panelSection} grid gap-3`}>
          <h2 className="m-0 text-[16px] font-bold">Ավելացնել օր</h2>
          <div className="grid gap-3 min-[560px]:grid-cols-[160px_minmax(0,1fr)_170px]">
            <label className={fieldLabel}>Օր<input className={fieldControl} name="day" type="date" min={`${year}-01-01`} max={`${year}-12-31`} required /></label>
            <label className={fieldLabel}>Վերնագիր<input className={fieldControl} name="title" required maxLength={200} placeholder="Սուրբ Ներսես Շնորհալի" /></label>
            <label className={fieldLabel}>Տեսակ
              <select className={fieldControl} name="kind" defaultValue="feast">
                {(Object.keys(CALENDAR_KINDS) as CalendarKind[]).map((kind) => <option key={kind} value={kind}>{CALENDAR_KINDS[kind].label}</option>)}
              </select>
            </label>
          </div>
          <button className={`${primaryButton} w-fit`} type="submit" name="intent" value="add" disabled={busy}><Plus aria-hidden="true" size={16} />Ավելացնել</button>
          <p className="m-0 text-[12.5px] text-muted">«Պահք» տեսակով օրը դառնում է պահքի օր, իսկ «Թաքցնել»-ը պահքի տողի վրա՝ հանում է պահքը այդ օրը։</p>
        </Form>

        {overrides.length ? (
          <section className={`${panelSection} grid gap-1.5`}>
            <h2 className="m-0 text-[16px] font-bold">Ձեռքով ուղղումներ</h2>
            {overrides.map((item) => (
              <Form key={item.id} method="post" className="flex flex-wrap items-center gap-2 border-t border-edge pt-1.5 text-[14px]">
                <input type="hidden" name="id" value={item.id} />
                <span className="w-[110px] text-muted">{dayMonth(item.day)}</span>
                <span className="min-w-0 flex-1">{item.hide ? <s>{item.title}</s> : item.title} <span className="text-[12px] text-muted">· {item.hide ? "թաքցված" : CALENDAR_KINDS[item.kind].label}</span></span>
                <button className={small} type="submit" name="intent" value="delete"><Trash2 aria-hidden="true" size={13} />Հանել</button>
              </Form>
            ))}
          </section>
        ) : null}

        <section className={`${panelSection} grid gap-1.5`}>
          <h2 className="m-0 text-[16px] font-bold">Հաշվարկված տոներ</h2>
          {computed.map((entry) => (
            <Form key={`${entry.day}-${entry.title}`} method="post" className="flex flex-wrap items-center gap-2 border-t border-edge pt-1.5 text-[14px]">
              <input type="hidden" name="day" value={entry.day} />
              <input type="hidden" name="title" value={entry.title} />
              <input type="hidden" name="kind" value={entry.kind} />
              <span className="w-[110px] text-muted">{dayMonth(entry.day)}</span>
              <span className={`min-w-0 flex-1 ${hidden.has(`${entry.day}|${entry.title}`) ? "text-faint line-through" : ""}`}>{entry.title}</span>
              {hidden.has(`${entry.day}|${entry.title}`) ? null : <button className={small} type="submit" name="intent" value="hide"><EyeOff aria-hidden="true" size={13} />Թաքցնել</button>}
            </Form>
          ))}
        </section>
      </div>
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
