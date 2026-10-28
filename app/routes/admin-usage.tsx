import { env } from "cloudflare:workers";
import { data, Link, useRevalidator } from "react-router";
import type { Route } from "./+types/admin-usage";
import { requireOwner } from "../auth/admin.server";
import { readCloudflareUsage, type UsageEnv } from "../data/cloudflare-usage.server";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { formatYerevanDateTime } from "../utils/armenian-date";

export function meta() { return [{ title: "Կայքի վիճակը — Հոգևոր ժառանգություն" }, { name: "robots", content: "noindex, nofollow" }]; }
export function headers() { return { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" }; }
export async function loader({ request }: Route.LoaderArgs) {
  await requireOwner(request, env.DB);
  const usage = await readCloudflareUsage(env as UsageEnv);
  return data({ usage }, { headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
export default function Usage({ loaderData }: Route.ComponentProps) {
  const { usage } = loaderData;
  const revalidator = useRevalidator();
  const number = (n: number, bytes: boolean) => bytes ? `${(n / 1e9).toFixed(3)} GB` : n.toLocaleString("en-US");
  return <PageShell><SiteNav /><PageHeader title="Կայքի վիճակը" eyebrow="Միայն գլխավոր ադմինի համար" />
    <Link to="/admin" className="text-gold-bright">← Կառավարում</Link>
    <section className="frosted-panel my-4 grid gap-3 p-5">
      <p>Cloudflare հաշվի ընդհանուր օգտագործումը՝ ներառյալ production-ը, staging-ը և նույն հաշվի մյուս նախագծերը։</p>
      <p>Թվերը կարող են ուշանալ։ Թարմացումը հարցվում է էջը բացելիս կամ կոճակով, առավելագույնը մեկ անգամ րոպեում՝ սերվերի տվյալ օրինակում։</p>
      <p>Չափման հարցման պահը՝ {formatYerevanDateTime(usage.sampledAt)}։ Օրական սահմանները զրոյանում են Երևանի 04:00-ին։</p>
      <button type="button" onClick={() => void revalidator.revalidate()} disabled={revalidator.state !== "idle"} className="min-h-11 rounded-xl border border-gold px-4 text-gold-bright">{revalidator.state !== "idle" ? "Թարմացվում է…" : "Թարմացնել տվյալները"}</button>
      {!usage.configured && <p role="status">Cloudflare-ի ընթերցման կապը դեռ կարգավորված չէ։ Օգտագործման թվերը չեն ցուցադրվում, մինչև կապը չմիացվի։</p>}
    </section>
    <Link to="/admin/media-inventory" className="my-4 block text-gold-bright">Ստուգել պահեստի հնարավոր չօգտագործվող ֆայլերը →</Link>
    <div className="grid gap-4 sm:grid-cols-2">{usage.metrics.map((metric) => {
      const percent = metric.used === null ? null : metric.used / metric.limit * 100;
      return <section key={metric.id} className="frosted-panel grid gap-2 p-5">
        <h2 className="text-lg font-semibold">{metric.label}</h2><p className="text-sm text-muted">{metric.period}</p>
        <p className="text-xl">{metric.used === null ? "Տվյալ չկա" : number(metric.used, metric.unit === "byte")} / {number(metric.limit, metric.unit === "byte")}</p>
        {percent !== null && <><progress className="w-full" aria-label={metric.label} value={Math.min(percent, 100)} max={100} /><p className={percent >= 80 ? "text-danger" : "text-muted"}>{percent.toFixed(1)}%{percent >= 100 ? " · Շեմը գերազանցված է" : percent >= 80 ? " · Մոտենում է շեմին" : ""}</p></>}
        {metric.error && <p role="status" className="text-sm">{metric.error}</p>}
      </section>;
    })}</div>
    <section className="frosted-panel my-4 grid gap-3 p-5">
      <p>Սահմանները Workers Free և R2 Standard անվճար հատկացումների հղման արժեքներն են, ոչ հաշվի վճարային պլանի ավտոմատ ստուգում։ Workers analytics-ը կարող է նմուշառված լինել։</p>
      <p>D1-ի մեկ անվճար բազայի սահմանը 500 MB է։ R2-ի 10 GB-month-ը ամսվա պահեստավորման հաշվարկ է. վերևի ծավալը դրա մոտավոր վերահսկման համար է, ոչ հաշիվ-ապրանքագիր։</p>
      <p>R2 գործողությունները դասակարգված են ըստ Cloudflare analytics-ի և կարող են ներառել չվճարվող ձախողումներ։ Ամսվա հաշվիչը կարող է տարբերվել հաշվի վճարային ժամանակաշրջանից։ Durable Objects-ի հարցումները վճարային ճշգրիտ հաշվարկ չեն, հատկապես WebSocket օգտագործող նախագծերի դեպքում։</p>
      <p>Durable Objects-ի 13 000 GB-s/օր ժամանակի սահմանն ու Workers-ի CPU-ն ստուգեք Cloudflare-ում․ այս էջը դրանց համար զրո չի ենթադրում։</p>
      <a className="text-gold-bright" href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer">Բացել Cloudflare-ի ամբողջական հաշվիչները ↗</a>
    </section>
  </PageShell>;
}
