import { env } from "cloudflare:workers";
import { Bookmark, ExternalLink, Tag } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { isRouteErrorResponse, Link, useLocation } from "react-router";

import type { Route } from "./+types/material";
import { getOptionalTelegramUser } from "../auth/telegram-user.server";
import { MaterialMediaGallery } from "../components/material-media";
import {
  FormattedTelegramText,
  TelegramRichMessage,
  TelegramLocationCard,
  TelegramPollCard,
  TimestampSeekContext,
  TelegramUnsupportedCard,
} from "../components/telegram-content";
import { leadingTitleLength } from "../utils/material-title";
import { ShareButton } from "../components/share-button";
import { PageHeader, PageShell, RouteErrorState } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { getPublicMaterialDetail } from "../data/material-detail.server";
import { listSavedMaterialIds } from "../data/saved-materials.server";
import { useSavedMaterials } from "../hooks/use-saved-materials";
import { formatArmenianDate } from "../utils/armenian-date";
import { isBridgeSearchHit, resolveContentCategoryId, type BridgeSearchHit } from "../../shared/telegram-bridge-contract";

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!/^material_[a-zA-Z0-9_-]{1,220}$/.test(params.materialId)) {
    throw new Response("Not Found", { status: 404 });
  }
  const [material, user] = await Promise.all([
    getPublicMaterialDetail(env.DB, params.materialId, request.signal),
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
  ];
}

export default function MaterialPage({ loaderData }: Route.ComponentProps) {
  const { material } = loaderData;
  const { isSaving, savedIds, setSaved } = useSavedMaterials(loaderData.savedIds);
  const isSaved = savedIds.has(material.id);
  const toggleSaved = useCallback(() => setSaved(material.id, !isSaved), [isSaved, material.id, setSaved]);
  const date = formatArmenianDate(material.dateValue ?? material.publishedAt);
  const location = useLocation();
  const stateHit = isBridgeSearchHit((location.state as { searchHit?: unknown } | null)?.searchHit)
    ? (location.state as { searchHit: BridgeSearchHit }).searchHit
    : undefined;
  const [activeHit, setActiveHit] = useState(stateHit);
  // The header already shows the title, so don't repeat it as the first line of the text.
  const textTitleLength = leadingTitleLength(material.formattedText.text, material.title);
  const captionTitleLength = leadingTitleLength(material.formattedCaption.text, material.title);

  useEffect(() => {
    setActiveHit(stateHit);
    if (!stateHit?.blockId) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(`telegram-${stateHit.blockId}`);
      if (!target) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    });
    const timeout = window.setTimeout(() => setActiveHit(undefined), 6_000);
    return () => { cancelAnimationFrame(frame); clearTimeout(timeout); };
  }, [stateHit]);

  return (
    <PageShell>
      <SiteNav />
      <PageHeader
        backTo={`/categories/${material.categorySlug}`}
        backLabel={material.categoryName}
        eyebrow={date ? `${material.categoryName} · ${date}` : material.categoryName}
        title={material.title}
        ornate={resolveContentCategoryId(null, material.categoryName) === "category_prayers"}
      />
      <TimestampSeekContext.Provider value={material.media.some((asset) => asset.url && ["video", "animation", "audio", "voice"].includes(asset.kind))}>
      <article className="grid gap-4">
        {material.richContent ? <TelegramRichMessage value={material.richContent} media={material.media} hit={activeHit} title={material.title} /> : <MaterialMediaGallery media={material.media} />}

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

        {!material.richContent && material.formattedText.text.length > textTitleLength ? (
          <div className="rounded-[20px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] px-4 py-5 text-[length:var(--reading-size)] leading-[1.9] text-ink shadow-card min-[560px]:px-7 min-[560px]:py-7" id="telegram-formatted-text" tabIndex={activeHit?.blockId === "formatted-text" ? -1 : undefined}>
            <FormattedTelegramText value={material.formattedText} from={textTitleLength} hit={activeHit?.blockId === "formatted-text" ? activeHit : undefined} />
          </div>
        ) : !material.richContent && !material.formattedText.text && material.formattedCaption.text.length > captionTitleLength ? (
          <p className="m-0 rounded-[20px] border border-glass-border bg-glass p-5 text-[length:var(--reading-size)] leading-[1.8] text-ink" id="telegram-formatted-caption" tabIndex={activeHit?.blockId === "formatted-caption" ? -1 : undefined}><FormattedTelegramText value={material.formattedCaption} from={captionTitleLength} hit={activeHit?.blockId === "formatted-caption" ? activeHit : undefined} /></p>
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
          <ShareButton
            className="grid size-11 cursor-pointer place-items-center rounded-[13px] border border-glass-border bg-subtle text-gold-bright"
            title={material.title}
            text={material.title}
            url={material.telegramUrl}
            pageUrl={typeof window === "undefined" ? `/materials/${material.id}` : window.location.href}
            menuAlign="left"
          />
        </div>
      </article>
      </TimestampSeekContext.Provider>
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <PageShell>
      <SiteNav />
      <PageHeader eyebrow="Հոգևոր ժառանգություն" title={notFound ? "Նյութը չի գտնվել" : "Չհաջողվեց բացել նյութը"} description="Փորձիր վերադառնալ բաժինների ցանկին։" />
      {notFound ? <Link className="mt-4 inline-flex text-[13px] font-bold text-gold-bright" to="/">Վերադառնալ գլխավոր էջ</Link> : <RouteErrorState title="Նյութը ժամանակավորապես չբացվեց" description="Կապը վերականգնելուց հետո կարող ես փորձել նույն էջը կրկին։" />}
    </PageShell>
  );
}
