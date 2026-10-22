/**
 * Search and sharing metadata: one canonical address on apostolic.am, a description, Open Graph
 * and Twitter cards, and structured data (JSON-LD) Google uses for rich results. Staging and old
 * addresses are kept out of search by an X-Robots-Tag header (workers/app.ts).
 */
import { resolveContentCategoryId, type ContentCategoryId } from "../../shared/telegram-bridge-contract";

export const SITE_URL = "https://apostolic.am";
export const SITE_NAME = "Հոգևոր ժառանգություն";
export const SITE_IMAGE = `${SITE_URL}/og-image.png`;
const ALTERNATE_NAMES = ["Apostolic", "apostolic.am", "Հայ Առաքելական Եկեղեցու գրադարան", "Armenian Apostolic Church Library"];

const SECTION_IMAGES: Record<ContentCategoryId, string> = {
  category_psalms: "psalms",
  category_prayers: "prayers",
  category_bible_questions: "bible-questions",
  category_gospel_teachings: "gospel-teachings",
  category_saints_lives: "saints-lives",
  category_daily_readings: "daily-readings",
};

/**
 * A section's link-preview picture (public/og, made by scripts/make-og-images.py): used for its
 * page and for materials without a picture of their own (psalms, prayers, questions).
 */
export function sectionImage(categoryId: string | null | undefined, categoryName?: string | null) {
  const id = resolveContentCategoryId(categoryId, categoryName);
  return id ? `/og/${SECTION_IMAGES[id]}.jpg` : null;
}

/**
 * The generated link-preview picture of a material at a readable address (/og/card/saghmosner/25/8,
 * routes/og-card.ts), on `origin`; `version` changes when the text does, so previews refresh.
 */
export function cardImage(origin: string, path: string, version?: string | null) {
  if (!/^\/[a-z-]+\/[a-z0-9-]+(?:\/\d{1,3})?$/u.test(path) || path.startsWith("/materials/")) return null;
  return `${origin}/og/card${path}${version ? `?v=${encodeURIComponent(version.replace(/\D/gu, "").slice(0, 14))}` : ""}`;
}

export function absoluteUrl(path: string) {
  return /^https?:\/\//u.test(path) ? path : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * A description of at most ~160 characters, cut at a word: without the title repeated at the
 * start, the "(Սաղմոս 1)" label and verse numbers ("1 ", "4. ", "[19] ").
 */
export function describe(text: string | null | undefined, fallback: string, title = "") {
  let clean = (text ?? "").replace(/[\u200B-\u200D\uFEFF]/gu, "").replace(/\s+/gu, " ").trim();
  const head = title.replace(/[\u200B-\u200D\uFEFF]/gu, "").replace(/\s+/gu, " ").trim();
  if (head && clean.toLocaleLowerCase("hy").startsWith(head.toLocaleLowerCase("hy"))) clean = clean.slice(head.length).trim();
  clean = clean
    .replace(/\(\s*սաղմոս\s+\d{1,3}\s*\)/giu, " ")
    .replace(/\[\d{1,3}\]\s*/gu, "")
    .replace(/(^|[\s։.!?»])\d{1,3}\.?\s+(?=\p{L})/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
  if (!clean) return fallback;
  if (clean.length <= 160) return clean;
  return `${clean.slice(0, 157).replace(/\s+\S*$/u, "")}…`;
}

export function seoMeta({ title, description, path, image, type = "website", jsonLd = [] }: {
  title: string; description: string; path: string; image?: string | null; type?: "website" | "article"; jsonLd?: object[];
}) {
  const url = absoluteUrl(path);
  const picture = image ? absoluteUrl(image) : SITE_IMAGE;
  return [
    { title },
    { name: "description", content: description },
    { name: "robots", content: "index, follow, max-image-preview:large" },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "hy_AM" },
    { property: "og:type", content: type },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: picture },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: picture },
    ...jsonLd.map((data) => ({ "script:ld+json": data })),
  ];
}

export const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  alternateName: ALTERNATE_NAMES,
  url: `${SITE_URL}/`,
  inLanguage: "hy",
  description: "Հայ Առաքելական Սուրբ Եկեղեցու հոգևոր գրադարան՝ աղոթքներ, սաղմոսներ, սրբերի վարքեր, Ավետարանի ուսուցում և օրվա ընթերցումներ։",
};

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  alternateName: ALTERNATE_NAMES,
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/icon-512.png`,
  description: "Անկախ թվային գրադարան՝ նվիրված Հայաստանյայց Առաքելական Սուրբ Եկեղեցու հոգևոր ժառանգությանը (Եկեղեցու պաշտոնական կայքը չէ)։",
  sameAs: ["https://t.me/armenian_apostolic_church", "https://t.me/armenian_apostolic_church_bot"],
};

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: absoluteUrl(item.path) })),
  };
}

/** Never index these (personal or utility pages). */
export const NOINDEX = [{ name: "robots", content: "noindex, follow" }];

function isoDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return undefined;
  const minutes = Math.floor(seconds / 60);
  return `PT${minutes ? `${minutes}M` : ""}${Math.round(seconds % 60)}S`;
}

/** AudioObject / VideoObject for a material's recordings and videos. */
export function mediaJsonLd(material: { title: string; publishedAt: string | null }, media: Array<{ kind: string; url: string | null; thumbnailUrl: string | null; mimeType: string | null; duration: number | null; title: string | null }>, description: string) {
  return media.flatMap((asset) => {
    if (!asset.url) return [];
    if (asset.kind === "audio" || asset.kind === "voice") {
      return [{ "@context": "https://schema.org", "@type": "AudioObject", name: asset.title || material.title, description, contentUrl: absoluteUrl(asset.url), encodingFormat: asset.mimeType ?? "audio/mpeg", duration: isoDuration(asset.duration), inLanguage: "hy", uploadDate: material.publishedAt ?? undefined }];
    }
    if (asset.kind === "video" && asset.thumbnailUrl) {
      return [{ "@context": "https://schema.org", "@type": "VideoObject", name: asset.title || material.title, description, contentUrl: absoluteUrl(asset.url), thumbnailUrl: absoluteUrl(asset.thumbnailUrl), encodingFormat: asset.mimeType ?? "video/mp4", duration: isoDuration(asset.duration), inLanguage: "hy", uploadDate: material.publishedAt ?? undefined }];
    }
    return [];
  });
}
