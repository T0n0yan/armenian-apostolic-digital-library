import { Bookmark, ChevronLeft, ChevronRight, ExternalLink, Tag } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { isRouteErrorResponse, Link, useLocation } from "react-router";

import type { Route } from "./+types/material";
import { MaterialMediaGallery, PsalmNavContext } from "../components/material-media";
import {
  FormattedTelegramText,
  TelegramRichMessage,
  TelegramLocationCard,
  TelegramPollCard,
  TimestampSeekContext,
  TelegramUnsupportedCard,
} from "../components/telegram-content";
import { leadingTitleLength, skipPsalmLabel } from "../utils/material-title";
import { ShareButton } from "../components/share-button";
import { ReminderButton } from "../components/reminder-button";
import { PsalmReadAlong } from "../components/psalm-read-along";
import { ReadMark, readKindFor } from "../components/read-mark";
import { PageHeader, PageShell, RouteErrorState } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { useSavedMaterials } from "../hooks/use-saved-materials";
import { isBridgeSearchHit, parseMaterialId, resolveContentCategoryId, type BridgeSearchHit } from "../../shared/telegram-bridge-contract";
import { materialPath } from "../utils/material-path";
import { loadMaterialPage } from "../data/material-page.server";
import { NOINDEX, SITE_IMAGE, SITE_NAME, SITE_URL, absoluteUrl, breadcrumbJsonLd, describe, seoMeta } from "../utils/seo";

export async function loader({ params, request }: Route.LoaderArgs) {
  return loadMaterialPage(params.materialId, request);
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Նյութ — Հոգևոր ժառանգություն" }, ...NOINDEX];
  const { material } = loaderData;
  const path = materialPath(material.id, material.categoryName);
  const picture = material.media.find((asset) => asset.kind === "photo")?.url ?? material.media.find((asset) => asset.thumbnailUrl)?.thumbnailUrl ?? null;
  const description = describe(material.contentText || material.captionText, `${material.title}՝ ${material.categoryName}, Հայ Առաքելական Սուրբ Եկեղեցու հոգևոր գրադարան։`);
  const categoryPath = `/categories/${material.categorySlug}`;
  return seoMeta({
    title: `${material.title} — ${material.categoryName} | Հոգևոր ժառանգություն`,
    description,
    path,
    image: picture,
    type: "article",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: material.title.slice(0, 110),
        description,
        inLanguage: "hy",
        url: absoluteUrl(path),
        mainEntityOfPage: absoluteUrl(path),
        image: picture ? absoluteUrl(picture) : SITE_IMAGE,
        datePublished: material.publishedAt ?? undefined,
        dateModified: material.editedAt ?? material.publishedAt ?? undefined,
        articleSection: material.categoryName,
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}/` },
        publisher: { "@type": "Organization", name: SITE_NAME, logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png` } },
      },
      breadcrumbJsonLd([{ name: SITE_NAME, path: "/" }, { name: material.categoryName, path: categoryPath }, { name: material.title, path }]),
    ],
  });
}

const actionTile = "action-tile flex min-h-[64px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[16px] px-1 text-[11.5px] font-bold no-underline transition-[transform,background,box-shadow] duration-150 active:scale-[.96] disabled:opacity-60";

export default function MaterialPage({ loaderData }: Route.ComponentProps) {
  const { material } = loaderData;
  const { isSaving, savedIds, setSaved } = useSavedMaterials(loaderData.savedIds);
  const isSaved = savedIds.has(material.id);
  const toggleSaved = useCallback(() => setSaved(material.id, !isSaved), [isSaved, material.id, setSaved]);
  const location = useLocation();
  const stateHit = isBridgeSearchHit((location.state as { searchHit?: unknown } | null)?.searchHit)
    ? (location.state as { searchHit: BridgeSearchHit }).searchHit
    : undefined;
  const [activeHit, setActiveHit] = useState(stateHit);
  // Prayers open with a bird-letter initial, as in old manuscripts.
  const contentCategory = resolveContentCategoryId(null, material.categoryName);
  const isPrayer = contentCategory === "category_prayers";
  const isPsalm = contentCategory === "category_psalms";
  // Prayers and psalms read in a prayer-book face, saints' lives and readings in a book serif;
  // teaching notes and questions keep the interface face.
  const readingClass = isPrayer ? "prayer-text" : isPsalm ? "prayer-text psalm-text"
    : contentCategory === "category_saints_lives" || contentCategory === "category_daily_readings" ? "sacred-text" : "";
  // The header already shows the title, so don't repeat it as the first line of the text.
  const textTitleLength = skipPsalmLabel(material.formattedText.text, leadingTitleLength(material.formattedText.text, material.title));
  // A psalm's superscription ("Սաղմոս Դաւթի, երբ…") is its first line; it stands apart from the verses.
  const superscriptionEnd = (() => {
    if (!isPsalm) return -1;
    const text = material.formattedText.text;
    let start = textTitleLength;
    while (start < text.length && /\s/u.test(text[start])) start += 1;
    const end = text.indexOf("\n", start);
    return end > start && end - start < 220 && /^\(?սաղմոս/iu.test(text.slice(start, end)) ? end : -1;
  })();
  // The verses begin after the blank lines that follow the superscription.
  let versesStart = superscriptionEnd + 1;
  while (superscriptionEnd > 0 && versesStart < material.formattedText.text.length && /\s/u.test(material.formattedText.text[versesStart])) versesStart += 1;
  const captionTitleLength = leadingTitleLength(material.formattedCaption.text, material.title);
  // Psalms always read verse by verse, whatever formatting Telegram gave the post (plain text, a
  // caption under the recording, or rich text): the text is laid out by the psalm standard.
  const psalmSource = [material.formattedText.text, material.contentText, material.formattedCaption.text, material.captionText].find((value) => value?.trim()) ?? "";
  const psalmText = psalmSource.slice(skipPsalmLabel(psalmSource, leadingTitleLength(psalmSource, material.title)));
  const psalmView = isPsalm && psalmText.trim().length > 0 && !activeHit;

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
        title={material.title}
      />
      <PsalmNavContext.Provider value={loaderData.psalm ? { previous: loaderData.psalm.previous, next: loaderData.psalm.next } : null}>
      <TimestampSeekContext.Provider value={material.media.some((asset) => asset.url && ["video", "animation", "audio", "voice"].includes(asset.kind))}>
      <article className={`mt-3 grid gap-4 min-[560px]:mt-4 ${readingClass}`}>
        {psalmView ? <MaterialMediaGallery media={material.media} /> : material.richContent && material.media.some((asset) => asset.attached) ? <MaterialMediaGallery media={material.media.filter((asset) => asset.attached)} /> : null}
        {psalmView ? null : material.richContent ? <TelegramRichMessage value={material.richContent} media={material.media} hit={activeHit} title={material.title} ornateInitial={isPrayer} /> : <MaterialMediaGallery media={material.media} />}

        {material.poll ? <TelegramPollCard poll={material.poll} telegramUrl={material.telegramUrl} title={material.title} materialId={material.id} votes={loaderData.pollVotes} canVote={loaderData.canSave} /> : null}
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

        {psalmView ? (
          // Psalms follow their recording verse by verse.
          <div className="reading-body frosted-panel px-4 py-5 text-[length:var(--reading-size)] leading-[1.9] text-ink shadow-card min-[560px]:px-7 min-[560px]:py-7">
            <PsalmReadAlong key={material.id} text={psalmText} materialId={material.id} timings={loaderData.psalmTimings} canMark={loaderData.canMarkPsalm} />
          </div>
        ) : !material.richContent && material.formattedText.text.length > textTitleLength ? (
          <div className="reading-body frosted-panel px-4 py-5 text-[length:var(--reading-size)] leading-[1.9] text-ink shadow-card min-[560px]:px-7 min-[560px]:py-7" id="telegram-formatted-text" tabIndex={activeHit?.blockId === "formatted-text" ? -1 : undefined}>
            {superscriptionEnd > 0 ? (
              <p className="psalm-superscription m-0 mb-3 border-b border-[rgb(217_181_111/32%)] pb-3 text-center">
                <FormattedTelegramText value={material.formattedText} from={textTitleLength} to={superscriptionEnd} hit={activeHit?.blockId === "formatted-text" ? activeHit : undefined} />
              </p>
            ) : null}
            <FormattedTelegramText value={material.formattedText} from={superscriptionEnd > 0 ? versesStart : textTitleLength} ornateInitial={isPrayer} hit={activeHit?.blockId === "formatted-text" ? activeHit : undefined} />
          </div>
        ) : !material.richContent && !material.formattedText.text && material.formattedCaption.text.length > captionTitleLength ? (
          <p className="reading-body m-0 frosted-panel p-5 text-[length:var(--reading-size)] leading-[1.8] text-ink" id="telegram-formatted-caption" tabIndex={activeHit?.blockId === "formatted-caption" ? -1 : undefined}><FormattedTelegramText value={material.formattedCaption} from={captionTitleLength} hit={activeHit?.blockId === "formatted-caption" ? activeHit : undefined} /></p>
        ) : null}

        {loaderData.canSave && !material.poll ? <ReadMark materialId={material.id} kind={readKindFor(material.media)} marks={loaderData.readMarks} /> : null}

        {/* One row of equal tiles: an icon with a short name under it. */}
        <div className={`grid gap-2 ${loaderData.canSave ? "grid-cols-4" : "grid-cols-2"}`}>
          {loaderData.canSave ? (
            <button className={actionTile} type="button" disabled={isSaving} onClick={toggleSaved} aria-pressed={isSaved} aria-label={isSaved ? "Հեռացնել Իմ անկյունից" : "Պահել Իմ անկյունում"}>
              <Bookmark aria-hidden="true" size={20} strokeWidth={1.9} fill={isSaved ? "currentColor" : "none"} />
              <span>{isSaved ? "Պահված է" : "Պահել"}</span>
            </button>
          ) : null}
          {loaderData.canSave ? (
            <ReminderButton className={actionTile} materialId={material.id} title={material.title} label prefetch />
          ) : null}
          <a className={actionTile} href={material.telegramUrl} target="_blank" rel="noreferrer" aria-label="Բացել Telegram-ում">
            <ExternalLink aria-hidden="true" size={20} strokeWidth={1.9} />
            <span>Telegram</span>
          </a>
          <ShareButton
            className={actionTile}
            title={material.title}
            text={material.title}
            url={material.telegramUrl}
            materialId={material.id}
            pageUrl={typeof window === "undefined" ? materialPath(material.id, material.categoryName) : window.location.href}
            label
          />
        </div>
      </article>
      </TimestampSeekContext.Provider>
      </PsalmNavContext.Provider>
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
