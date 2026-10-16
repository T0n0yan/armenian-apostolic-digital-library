import { env } from "cloudflare:workers";
import { Bookmark, ExternalLink, Tag } from "lucide-react";
import { useCallback } from "react";
import { isRouteErrorResponse, Link } from "react-router";

import type { Route } from "./+types/material";
import { getOptionalTelegramUser } from "../auth/telegram-user.server";
import { MaterialMediaGallery } from "../components/material-media";
import {
  FormattedTelegramText,
  TelegramLocationCard,
  TelegramPollCard,
  TelegramUnsupportedCard,
} from "../components/telegram-content";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { getPublicMaterialDetail } from "../data/material-detail.server";
import { listSavedMaterialIds } from "../data/saved-materials.server";
import { useSavedMaterials } from "../hooks/use-saved-materials";
import { formatArmenianDate } from "../utils/armenian-date";

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!/^material_[a-zA-Z0-9_-]{1,220}$/.test(params.materialId)) {
    throw new Response("Not Found", { status: 404 });
  }
  const [material, user] = await Promise.all([
    getPublicMaterialDetail(env.DB, params.materialId),
    getOptionalTelegramUser(request),
  ]);
  if (!material) throw new Response("Not Found", { status: 404 });
  const savedIds = user ? await listSavedMaterialIds(env.DB, user.id) : [];
  return { material, canSave: Boolean(user), savedIds };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${loaderData?.material.title ?? "Նյութ"} — Հոգևոր ժառանգություն` },
    { name: "robots", content: "noindex, nofollow" },
    { name: "theme-color", content: "#100817" },
  ];
}

export default function MaterialPage({ loaderData }: Route.ComponentProps) {
  const { material } = loaderData;
  const { isSaving, savedIds, setSaved } = useSavedMaterials(loaderData.savedIds);
  const isSaved = savedIds.has(material.id);
  const toggleSaved = useCallback(() => setSaved(material.id, !isSaved), [isSaved, material.id, setSaved]);
  const date = formatArmenianDate(material.dateValue ?? material.publishedAt);

  return (
    <PageShell>
      <SiteNav />
      <PageHeader
        backTo={`/categories/${material.categorySlug}`}
        backLabel={material.categoryName}
        eyebrow={date ? `${material.categoryName} · ${date}` : material.categoryName}
        title={material.title}
      />
      <article className="grid gap-4">
        <MaterialMediaGallery media={material.media} />

        {material.poll ? <TelegramPollCard poll={material.poll} telegramUrl={material.telegramUrl} /> : null}
        {material.location ? <TelegramLocationCard location={material.location} /> : null}
        {material.contentType === "unsupported" ? <TelegramUnsupportedCard type={material.unsupportedType} telegramUrl={material.telegramUrl} /> : null}

        {material.tags.length > 0 ? (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Պիտակներ">
            {material.tags.map((tag) => (
              <li className="inline-flex items-center gap-1 rounded-full border border-glass-border bg-subtle px-2.5 py-1 text-[11px] text-muted" key={tag}>
                <Tag aria-hidden="true" size={12} /> {tag}
              </li>
            ))}
          </ul>
        ) : null}

        {material.formattedText.text ? (
          <div className="rounded-[20px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] px-4 py-5 text-[15px] leading-[1.9] text-ink shadow-card min-[560px]:px-7 min-[560px]:py-7 min-[560px]:text-[16px]">
            <FormattedTelegramText value={material.formattedText} />
          </div>
        ) : material.formattedCaption.text ? (
          <p className="m-0 rounded-[20px] border border-glass-border bg-glass p-5 text-[15px] leading-[1.8] text-ink"><FormattedTelegramText value={material.formattedCaption} /></p>
        ) : null}

        <div className="flex flex-wrap gap-2.5">
          {loaderData.canSave ? (
            <button className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[13px] border border-[rgb(217_181_111/25%)] bg-[rgb(217_181_111/9%)] px-4 text-[12px] font-bold text-gold-bright" type="button" disabled={isSaving} onClick={toggleSaved}>
              <Bookmark aria-hidden="true" size={17} fill={isSaved ? "currentColor" : "none"} />
              {isSaved ? "Հեռացնել Իմ անկյունից" : "Պահել Իմ անկյունում"}
            </button>
          ) : null}
          <a className="inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-glass-border bg-subtle px-4 text-[12px] font-bold text-muted no-underline hover:text-gold-bright" href={material.telegramUrl} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden="true" size={17} /> Բացել սկզբնականը Telegram-ում
          </a>
        </div>
      </article>
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <PageShell>
      <SiteNav />
      <PageHeader eyebrow="Հոգևոր ժառանգություն" title={notFound ? "Նյութը չի գտնվել" : "Չհաջողվեց բացել նյութը"} description="Փորձիր վերադառնալ բաժինների ցանկին։" />
      <Link className="mt-4 inline-flex text-[13px] font-bold text-gold-bright" to="/">Վերադառնալ գլխավոր էջ</Link>
    </PageShell>
  );
}
