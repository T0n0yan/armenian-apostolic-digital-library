import { env } from "cloudflare:workers";
import { ExternalLink, Hash, Tags } from "lucide-react";
import { data, Form, redirect } from "react-router";

import type { Route } from "./+types/admin";
import { createAdminNavigationCookie, requireAdmin, requireSameOrigin } from "../auth/admin.server";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { fieldControl, fieldLabel, panelSection, primaryButton } from "../components/ui-styles";
import { listActiveCategories } from "../data/categories.server";
import { listPendingTelegramReviews, resolveTelegramReview } from "../data/telegram-review.server";

type HashtagMapping = { hashtag: string; categoryId: string };

async function listHashtagMappings(database: D1Database) {
  const { results } = await database.prepare(
    "SELECT hashtag, category_id AS categoryId FROM telegram_hashtag_mappings ORDER BY hashtag",
  ).all<HashtagMapping>();
  return results;
}

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request, env.DB);
  const [categories, pendingReviews, hashtags] = await Promise.all([
    listActiveCategories(env.DB),
    listPendingTelegramReviews(env.DB),
    listHashtagMappings(env.DB),
  ]);
  return data({ admin, categories, pendingReviews, hashtags }, {
    headers: { "Set-Cookie": createAdminNavigationCookie(request) },
  });
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request, env.DB);
  requireSameOrigin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  const categoryId = form.get("categoryId");
  if (typeof categoryId !== "string") return data({ error: "Ընտրիր բաժինը։" }, { status: 400 });

  if (intent === "review-resolve") {
    const reviewId = form.get("reviewId");
    const topicValue = form.get("forumTopicId");
    const forumTopicId = typeof topicValue === "string" && /^\d+$/u.test(topicValue) ? Number(topicValue) : null;
    if (typeof reviewId !== "string" || !reviewId.startsWith("review_material_tg_")) {
      return data({ error: "Սխալ Telegram reference։" }, { status: 400 });
    }
    if (!(await resolveTelegramReview(env.DB, reviewId, categoryId, forumTopicId))) {
      return data({ error: "Mapping-ը չպահվեց։" }, { status: 409 });
    }
    return redirect("/admin?mapped=1");
  }

  if (intent === "hashtag-map") {
    const hashtagValue = form.get("hashtag");
    if (typeof hashtagValue !== "string") return data({ error: "Գրիր hashtag-ը։" }, { status: 400 });
    const hashtag = hashtagValue.normalize("NFC").replace(/^#/u, "").toLocaleLowerCase("hy-AM").trim();
    if (!/^[\p{L}\p{N}_]{1,64}$/u.test(hashtag)) return data({ error: "Hashtag-ը սխալ է։" }, { status: 400 });
    const category = await env.DB.prepare("SELECT id FROM categories WHERE id=? AND is_active=1").bind(categoryId).first();
    if (!category) return data({ error: "Բաժինը չի գտնվել։" }, { status: 400 });
    await env.DB.prepare(
      "INSERT INTO telegram_hashtag_mappings (hashtag, category_id) VALUES (?, ?) " +
      "ON CONFLICT(hashtag) DO UPDATE SET category_id=excluded.category_id, updated_at=CURRENT_TIMESTAMP",
    ).bind(hashtag, categoryId).run();
    return redirect("/admin?hashtag=1");
  }
  return data({ error: "Անհայտ գործողություն։" }, { status: 400 });
}

export default function Admin({ loaderData }: Route.ComponentProps) {
  return (
    <PageShell>
      <SiteNav />
      <PageHeader eyebrow="Պաշտպանված կառավարում" title="Telegram mapping-ներ" description="D1-ում պահվում են միայն բաժինների mapping-ները և review state-ը։" />

      <section className={panelSection}>
        <h2 className="m-0 flex items-center gap-2 text-[17px]"><Hash aria-hidden="true" size={19} /> Hashtag mapping</h2>
        <Form className="grid gap-3 min-[720px]:grid-cols-[1fr_1fr_auto]" method="post">
          <input type="hidden" name="intent" value="hashtag-map" />
          <label className={fieldLabel}>Hashtag<input className={fieldControl} name="hashtag" placeholder="աղոթք" required /></label>
          <label className={fieldLabel}>Բաժին<select className={fieldControl} name="categoryId" required><option value="">Ընտրել</option>{loaderData.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <button className={primaryButton + " self-end"} type="submit">Պահել</button>
        </Form>
        {loaderData.hashtags.length > 0 ? <ul className="m-0 grid list-none gap-2 p-0">{loaderData.hashtags.map((mapping) => <li className="rounded-xl border border-glass-border bg-subtle px-3 py-2 text-[12px]" key={mapping.hashtag}>#{mapping.hashtag} → {loaderData.categories.find((item) => item.id === mapping.categoryId)?.name}</li>)}</ul> : null}
      </section>

      <section className={panelSection}>
        <h2 className="m-0 flex items-center gap-2 text-[17px]"><Tags aria-hidden="true" size={19} /> Չդասակարգված նյութեր</h2>
        {loaderData.pendingReviews.length === 0 ? <p className="m-0 text-[13px] text-muted">Չդասակարգված նյութ չկա։</p> : (
          <ul className="m-0 grid list-none gap-3 p-0">
            {loaderData.pendingReviews.map((review) => (
              <li className="grid gap-3 rounded-[16px] border border-glass-border bg-subtle p-3" key={review.id}>
                <div className="grid gap-1"><strong>{review.title}</strong><span className="text-[11px] text-faint">{review.sourceTitle} · #{review.materialId}</span><a className="inline-flex items-center gap-1 text-[12px] text-gold-bright" href={review.telegramUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Telegram</a></div>
                <Form className="flex flex-wrap items-end gap-2" method="post">
                  <input type="hidden" name="intent" value="review-resolve" />
                  <input type="hidden" name="reviewId" value={review.id} />
                  <input type="hidden" name="forumTopicId" value={review.topicId ?? ""} />
                  <label className={fieldLabel + " min-w-[220px] flex-1"}>Բաժին<select className={fieldControl} name="categoryId" required><option value="">Ընտրել</option>{loaderData.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                  <button className={primaryButton} type="submit">Դասակարգել</button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}

export function ErrorBoundary() {
  return <PageShell><SiteNav /><PageHeader eyebrow="Պաշտպանված կառավարում" title="Admin էջը հասանելի չէ" /></PageShell>;
}
