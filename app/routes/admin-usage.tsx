import { env } from "cloudflare:workers";
import { Activity, Database, HardDrive, RefreshCw, Server, Timer } from "lucide-react";
import type { ReactNode } from "react";
import { data, Link, useRevalidator } from "react-router";

import type { Route } from "./+types/admin-usage";
import { requireOwner } from "../auth/admin.server";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { panelSection } from "../components/ui-styles";
import { readCloudflareUsage, type UsageEnv, type UsageMetric } from "../data/cloudflare-usage.server";
import { formatYerevanDateTime } from "../utils/armenian-date";

export function meta() { return [{ title: "Կայքի վիճակը — Հոգևոր ժառանգություն" }, { name: "robots", content: "noindex, nofollow" }]; }
export function headers() { return { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" }; }

export async function loader({ request }: Route.LoaderArgs) {
  await requireOwner(request, env.DB);
  const usage = await readCloudflareUsage(env as UsageEnv);
  return data({ usage }, { headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
}

/** Groups of the free plan's limits, in the order the owner reads them. */
const GROUPS: Array<{ title: string; icon: ReactNode; ids: string[] }> = [
  { title: "Այսօր", icon: <Timer aria-hidden="true" size={18} />, ids: ["workers", "d1-read", "d1-write", "do-requests"] },
  { title: "Այս ամիս", icon: <Activity aria-hidden="true" size={18} />, ids: ["r2-a", "r2-b"] },
  { title: "Պահեստ", icon: <HardDrive aria-hidden="true" size={18} />, ids: ["d1-storage", "d1-largest", "r2-storage"] },
];

/** 12 345 հարցում · 1.2 ՄԲ · 3.4 ԳԲ: readable at a glance. */
function amount(value: number, unit: string) {
  if (unit === "byte") {
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)} ԳԲ`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)} ՄԲ`;
    return `${Math.round(value / 1e3)} ԿԲ`;
  }
  return value.toLocaleString("en-US").replaceAll(",", " ");
}

function MetricCard({ metric }: { metric: UsageMetric }) {
  const percent = metric.used === null ? null : (metric.used / metric.limit) * 100;
  const tone = percent === null ? "text-faint" : percent >= 100 ? "text-danger" : percent >= 80 ? "text-[#c27a1d]" : "text-[#3f8f5a]";
  const bar = percent === null ? "" : percent >= 100 ? "bg-[#b8483e]" : percent >= 80 ? "bg-[#d4952c]" : "bg-[linear-gradient(90deg,#3f8f5a,#6fb37f)]";
  return (
    <div className="frosted-card grid gap-2 p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink">{metric.label}</span>
        <span className={`text-[13px] font-bold tabular-nums ${tone}`}>{percent === null ? "—" : `${percent < 1 && percent > 0 ? "<1" : Math.round(percent)}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
        {percent !== null ? <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, Math.max(percent, 1.5))}%` }} /> : null}
      </div>
      <div className="flex items-baseline justify-between gap-2 text-[12px] text-muted tabular-nums">
        <span>{metric.used === null ? "Տվյալ չկա" : amount(metric.used, metric.unit)}</span>
        <span>սահմանը՝ {amount(metric.limit, metric.unit)}</span>
      </div>
      {metric.error ? <span className="text-[11.5px] text-faint">{metric.error}</span> : null}
    </div>
  );
}

/** The owner's view of the free plan: how much of each daily, monthly and storage limit is used. */
export default function Usage({ loaderData }: Route.ComponentProps) {
  const { usage } = loaderData;
  const revalidator = useRevalidator();
  const byId = new Map(usage.metrics.map((metric) => [metric.id, metric]));
  const worst = Math.max(0, ...usage.metrics.map((metric) => (metric.used === null ? 0 : (metric.used / metric.limit) * 100)));
  return (
    <PageShell width="admin">
      <SiteNav />
      <PageHeader backTo="/admin" backLabel="Կառավարում" title="Կայքի վիճակը" />
      <div className="mt-4 grid gap-4">
        <section className={`${panelSection} grid gap-3`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-0.5">
              <strong className={`text-[17px] ${!usage.configured ? "text-muted" : worst >= 100 ? "text-danger" : worst >= 80 ? "text-[#c27a1d]" : "text-[#3f8f5a]"}`}>
                {!usage.configured ? "Թվերը դեռ միացված չեն" : worst >= 100 ? "Սահմանը գերազանցված է" : worst >= 80 ? "Մոտենում է սահմանին" : "Ամեն ինչ նորմալ է"}
              </strong>
              <span className="text-[12.5px] text-muted">Չափված՝ {formatYerevanDateTime(usage.sampledAt)} · օրական սահմանները զրոյանում են Երևանի 04:00-ին</span>
            </div>
            <button type="button" onClick={() => void revalidator.revalidate()} disabled={revalidator.state !== "idle"}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[12px] border border-[rgb(217_181_111/45%)] bg-transparent px-3.5 text-[13px] font-semibold text-gold-bright disabled:opacity-60">
              <RefreshCw aria-hidden="true" size={15} className={revalidator.state !== "idle" ? "animate-search-spin" : ""} /> Թարմացնել
            </button>
          </div>
          {!usage.configured ? (
            <p className="m-0 rounded-[12px] bg-subtle px-3 py-2.5 text-[13px] leading-relaxed text-ink">
              Իրական թվերի համար Cloudflare-ում պետք է մեկ անգամ ավելացնել ընթերցման բանալի (Analytics Read)։ Դա «Ինտեգրացիաներ» չատի գործն է. նա քայլ առ քայլ ցույց կտա, թե որտեղ սեղմել։ Բանալին մուտքագրում եք ինքներդ, այն չի երևում ոչ մեկին։
            </p>
          ) : null}
        </section>
        {GROUPS.map((group) => (
          <section key={group.title} className={`${panelSection} grid gap-3`}>
            <h2 className="m-0 flex items-center gap-2 text-[16px] font-bold text-ink"><span className="text-gold">{group.icon}</span>{group.title}</h2>
            <div className="grid gap-2.5 min-[620px]:grid-cols-2">
              {group.ids.map((id) => byId.get(id)).filter((metric): metric is UsageMetric => Boolean(metric)).map((metric) => <MetricCard key={metric.id} metric={metric} />)}
            </div>
          </section>
        ))}
        <details className={`${panelSection} text-[12.5px] leading-relaxed text-muted`}>
          <summary className="cursor-pointer text-[13px] font-semibold text-ink"><Server aria-hidden="true" size={15} className="mr-1.5 inline text-gold" />Ինչ են նշանակում թվերը</summary>
          <div className="mt-2 grid gap-2">
            <p className="m-0">Թվերը ամբողջ Cloudflare հաշվինն են՝ պռոդ, staging և նույն հաշվի այլ նախագծեր միասին։ Կարող են ուշանալ մի քանի րոպե։</p>
            <p className="m-0">Սահմանները անվճար փաթեթինն են (Workers Free, D1, R2 Standard)։ Սա հաշիվ-ապրանքագիր չէ, այլ մոտավոր հսկողություն։</p>
            <p className="m-0">Workers-ի CPU-ն և Durable Objects-ի ժամանակը այստեղ չեն հաշվվում. դրանք նայեք Cloudflare-ում։</p>
          </div>
        </details>
        <div className="flex flex-wrap gap-4 px-1 text-[13px]">
          <Link className="text-gold-bright" to="/admin/media-inventory"><Database aria-hidden="true" size={14} className="mr-1 inline" />Պահեստի չօգտագործվող ֆայլերը →</Link>
          <a className="text-gold-bright" href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer">Cloudflare-ի ամբողջական էջը ↗</a>
        </div>
      </div>
    </PageShell>
  );
}
