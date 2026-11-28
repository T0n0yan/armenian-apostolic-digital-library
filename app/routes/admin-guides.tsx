import { env } from "cloudflare:workers";
import { ChevronRight, Plus } from "lucide-react";
import { Form, Link, redirect } from "react-router";

import type { Route } from "./+types/admin-guides";
import { requirePermission, requireSameOrigin } from "../auth/admin.server";
import { guidesAdmin } from "../auth/guides-admin.server";
import { RouteErrorPage } from "../components/error-page";
import { ChurchIcon } from "../components/etiquette-ui";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { fieldControl, panelSection, primaryButton } from "../components/ui-styles";
import { getGuide, listGuides, saveGuide } from "../data/guides.server";
import { GUIDE_STATUSES, GUIDE_TOOLS, guidePath, isGuideSlug } from "../utils/guides";

export function meta() {
  return [{ title: "Կարգեր և վարքեր — Կառավարում" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await guidesAdmin(request);
  return { guides: await listGuides(env.DB, true) };
}

export async function action({ request }: Route.ActionArgs) {
  const admin = await requirePermission(request, env.DB, "guides");
  requireSameOrigin(request);
  const form = await request.formData();
  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  const title = String(form.get("title") ?? "").trim();
  if (!isGuideSlug(slug) || !title) return { error: "Հասցեն՝ լատինատառ, թվեր և գծիկ (2–40 նիշ), վերնագիրը՝ պարտադիր։" };
  if (await getGuide(env.DB, slug)) return { error: "Այդ հասցեով ուղեցույց արդեն կա։" };
  await saveGuide(env.DB, { slug, title, description: "", summary: "", kind: "guide", link: "", icon: "book-open", body: { blocks: [], faq: [] }, sources: [], status: "draft", verifiedBy: "", sort: 500 }, admin.email);
  throw redirect(`/admin/guides/${slug}`);
}

export default function AdminGuides({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <PageShell>
      <SiteNav />
      <PageHeader showSearch={false} backTo="/admin" backLabel="Կառավարում" title="Կարգեր և վարքեր" />
      <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <section className={`${panelSection} grid gap-2`}>
          <p className="m-0 text-[14px] leading-relaxed text-muted">
            Ամեն ուղեցույց՝ «Սևագիր» (միայն դուք եք տեսնում), «Ստուգման մեջ» (երևում է ⚑ նշումով) կամ «Ստուգված է» (քահանան ստուգել է)։
            Էջը՝ <Link className="text-gold-bright" to="/church">/church</Link>։
          </p>
        </section>

        {GUIDE_TOOLS.length ? (
          <ul className="m-0 grid list-none gap-2 p-0 min-[560px]:grid-cols-2">
            {GUIDE_TOOLS.map((tool) => (
              <li key={tool.to}>
                <Link className={`${panelSection} flex items-center justify-between gap-3 !p-4 text-inherit no-underline`} to={tool.to}>
                  <span className="grid gap-0.5"><strong className="text-[15.5px]">{tool.title}</strong><span className="text-[12.5px] text-muted">{tool.note}</span></span>
                  <ChevronRight aria-hidden="true" size={18} className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        <ol className="m-0 grid list-none gap-2 p-0">
          {loaderData.guides.map((guide) => (
            <li key={guide.slug}>
              <Link className={`${panelSection} flex items-center gap-3 !p-3.5 text-inherit no-underline`} to={`/admin/guides/${guide.slug}`}>
                <span className="grid size-10 shrink-0 place-items-center rounded-control bg-[rgb(176_125_46/14%)] text-gold-bright"><ChurchIcon icon={guide.icon} /></span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <strong className="text-[15.5px] leading-snug">{guide.title}</strong>
                  <span className="text-[12.5px] text-muted">{guidePath(guide)} · {guide.kind === "link" ? "հղում" : `${guide.body.blocks.length} բլոկ`} · {GUIDE_STATUSES[guide.status]}</span>
                </span>
                <ChevronRight aria-hidden="true" size={18} className="shrink-0 text-faint" />
              </Link>
            </li>
          ))}
        </ol>

        <Form method="post" className={`${panelSection} grid gap-3`}>
          <h2 className="m-0 text-[16px] font-bold">Նոր ուղեցույց</h2>
          <input className={fieldControl} name="title" placeholder="Վերնագիր" required maxLength={160} />
          <input className={fieldControl} name="slug" placeholder="Հասցե՝ լատինատառ (օր.՝ baptism)" required pattern="[a-z0-9-]{2,40}" />
          {actionData?.error ? <p className="m-0 text-[13px] text-danger">{actionData.error}</p> : null}
          <button className={`${primaryButton} w-fit`} type="submit"><Plus aria-hidden="true" size={16} />Ստեղծել սևագիր</button>
        </Form>
      </div>
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
