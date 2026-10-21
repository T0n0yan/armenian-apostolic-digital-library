/**
 * Search and sharing metadata: one canonical address on apostolic.am, a description, Open Graph
 * and Twitter cards, and structured data (JSON-LD) Google uses for rich results. Staging and old
 * addresses are kept out of search by an X-Robots-Tag header (workers/app.ts).
 */
export const SITE_URL = "https://apostolic.am";
export const SITE_NAME = "Հոգևոր ժառանգություն";
export const SITE_IMAGE = `${SITE_URL}/og-image.png`;
const ALTERNATE_NAMES = ["Apostolic", "apostolic.am", "Հայ Առաքելական Եկեղեցու գրադարան", "Armenian Apostolic Church Library"];

export function absoluteUrl(path: string) {
  return /^https?:\/\//u.test(path) ? path : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** A description of at most ~160 characters, cut at a word. */
export function describe(text: string | null | undefined, fallback: string) {
  const clean = (text ?? "").replace(/\s+/gu, " ").trim();
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
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
    "query-input": "required name=search_term_string",
  },
};

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  alternateName: ALTERNATE_NAMES,
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/icon-512.png`,
  sameAs: ["https://t.me/armenian_apostolic_church_bot"],
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
