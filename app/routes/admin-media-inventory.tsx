import { env } from "cloudflare:workers";
import { data, Link } from "react-router";
import type { Route } from "./+types/admin-media-inventory";
import { requireOwner } from "../auth/admin.server";
import { mediaInventoryPage } from "../data/media-inventory.server";
import { PageHeader, PageShell } from "../components/page-layout";
export function meta() { return [{ title: "Մեդիայի հաշվառում" }, { name: "robots", content: "noindex, nofollow" }]; }
export function headers() { return { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" }; }
export async function loader({ request }: Route.LoaderArgs) {
  await requireOwner(request, env.DB);
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  if (cursor && cursor.length > 2048) throw new Response("Invalid cursor", { status: 400 });
  return data(await mediaInventoryPage(env.MEDIA, env.DB, cursor), { headers: { "Cache-Control": "private, no-store" } });
}
export default function Inventory({ loaderData: report }: Route.ComponentProps) {
  return <PageShell><PageHeader title="Մեդիայի հաշվառում" /><Link to="/admin/usage">← Կայքի վիճակը</Link>
    <p className="my-4">Այս էջում ստուգվել է {report.scanned} օբյեկտ՝ {(report.bytes / 1e6).toFixed(2)} MB։ Սա ամբողջ պահեստի ծավալը չէ։</p>
    <p>Ստորև՝ 14 օրից հին գրադարանային ֆայլեր, որոնց հղումը բազայում չի գտնվել։ Սա ջնջելու թույլտվություն չէ․ պետք է համեմատել սինխրոնացման և պահուստային պատճենների հետ։ Ֆայլեր չեն ջնջվում։</p>
    <ul className="my-4 grid gap-3">{report.candidates.map((item) => <li key={item.key} className="frosted-panel break-all p-3">{item.key} · {(item.bytes / 1e6).toFixed(2)} MB</li>)}</ul>
    {!report.candidates.length && <p>Այս մասում թեկնածուներ չկան։</p>}
    {report.next && <Link className="my-4 block text-gold-bright" to={`?cursor=${encodeURIComponent(report.next)}`}>Ստուգել հաջորդ 100-ը →</Link>}
  </PageShell>;
}
