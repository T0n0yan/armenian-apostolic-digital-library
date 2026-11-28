// «Ուղեցույցներ» համակարգ (աղյուսակ `guides`, migration 0057)։ Ամեն ուղեցույց՝ մեկ ձևանմուշով.
// ինչ է → երբ → ինչպես պատրաստվել → ընթացքը → տեքստ → ինչու, ներքևում՝ ՀՏՀ և աղբյուրներ։
// Կարգավիճակ՝ սևագիր (միայն ադմինը տեսնի) / ստուգման մեջ / հրապարակված (քահանան ստուգել է)։

export type GuideStatus = "draft" | "review" | "published";
/** Կանոն՝ Եկեղեցու սահմանած, ավանդույթ՝ ընդունված սովորություն, ժողովրդական սովորույթ՝ ոչ եկեղեցական։ */
export type GuideTag = "canon" | "tradition" | "custom";
/** guide՝ էջ բլոկներով, link՝ քարտ, որը տանում է այլ էջ (Վարք եկեղեցում, Տոնացույց, Պատարագամատույց)։ */
export type GuideKind = "guide" | "link";

export type GuideBlock = {
  id: string;
  title: string;
  /** Երբ (մեկ տող)։ */
  when?: string;
  tag?: GuideTag;
  /** Ինչ է։ */
  text: string;
  /** Ինչպես պատրաստվել։ */
  prepare?: string;
  /** Ընթացքը։ */
  steps?: string;
  /** Աղոթքի / արարողության տեքստ։ */
  prayer?: string;
  /** Ինչու։ */
  why?: string;
};

export type GuideFaq = { q: string; a: string };
export type GuideBody = { blocks: GuideBlock[]; faq: GuideFaq[] };

export type Guide = {
  slug: string;
  title: string;
  description: string;
  summary: string;
  kind: GuideKind;
  link: string;
  icon: string;
  body: GuideBody;
  sources: string[];
  status: GuideStatus;
  verifiedBy: string;
  sort: number;
  updatedAt: string;
};

export const GUIDE_STATUSES: Record<GuideStatus, string> = {
  draft: "Սևագիր",
  review: "Ստուգման մեջ",
  published: "Ստուգված է",
};

export const GUIDE_TAGS: Record<GuideTag, { label: string; className: string }> = {
  canon: { label: "Կանոն", className: "bg-[rgb(61_118_80/16%)] text-success" },
  tradition: { label: "Ավանդույթ", className: "bg-[rgb(217_181_111/20%)] text-gold-bright" },
  custom: { label: "Ժողովրդական սովորույթ", className: "bg-[rgb(120_110_95/14%)] text-muted" },
};

/** Ձևանմուշի դաշտերը՝ ցուցադրման կարգով (text-ը և when-ը՝ առանձին)։ */
export const BLOCK_PARTS = [
  ["prepare", "Ինչպես պատրաստվել"],
  ["steps", "Ընթացքը"],
  ["prayer", "Տեքստ"],
  ["why", "Ինչու"],
] as const;

export const isGuideSlug = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9-]{2,40}$/u.test(value);
const isStatus = (value: unknown): value is GuideStatus => value === "draft" || value === "review" || value === "published";
const isTag = (value: unknown): value is GuideTag => value === "canon" || value === "tradition" || value === "custom";

const LIMIT = { title: 160, line: 300, text: 8000 };
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\r\n?/gu, "\n").trim().slice(0, max) : "");

/** Ադմինից եկած (կամ բազայում պահված) մարմինը՝ մաքրված. անծանոթ դաշտերը դուրս են մնում։ */
export function normalizeGuideBody(input: unknown): GuideBody {
  const raw = (input && typeof input === "object" ? input : {}) as { blocks?: unknown; faq?: unknown };
  const used = new Set<string>();
  const blocks = (Array.isArray(raw.blocks) ? raw.blocks : []).slice(0, 60).flatMap((item, index): GuideBlock[] => {
    const value = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const title = clean(value.title, LIMIT.title);
    if (!title) return [];
    let id = typeof value.id === "string" && /^[a-z0-9-]{1,40}$/u.test(value.id) ? value.id : `b${index + 1}`;
    while (used.has(id)) id = `${id}-${index + 1}`;
    used.add(id);
    const block: GuideBlock = { id, title, text: clean(value.text, LIMIT.text) };
    const when = clean(value.when, LIMIT.line);
    if (when) block.when = when;
    if (isTag(value.tag)) block.tag = value.tag;
    for (const [key] of BLOCK_PARTS) {
      const part = clean(value[key], LIMIT.text);
      if (part) block[key] = part;
    }
    return [block];
  });
  const faq = (Array.isArray(raw.faq) ? raw.faq : []).slice(0, 60).flatMap((item): GuideFaq[] => {
    const value = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const q = clean(value.q, LIMIT.line), a = clean(value.a, LIMIT.text);
    return q && a ? [{ q, a }] : [];
  });
  return { blocks, faq };
}

export function normalizeSources(input: unknown): string[] {
  const list = Array.isArray(input) ? input : typeof input === "string" ? input.split("\n") : [];
  return list.map((value) => clean(value, LIMIT.line)).filter(Boolean).slice(0, 20);
}

export function parseJson(text: string | null | undefined): unknown {
  try { return JSON.parse(text ?? "null"); } catch { return null; }
}

export type GuideRow = {
  slug: string; title: string; description: string; summary: string; kind: string; link: string; icon: string;
  body_json: string; sources_json: string; status: string; verified_by: string; sort: number; updated_at: string;
};

export function guideFromRow(row: GuideRow): Guide {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    summary: row.summary,
    kind: row.kind === "link" ? "link" : "guide",
    link: row.link,
    icon: row.icon,
    body: normalizeGuideBody(parseJson(row.body_json)),
    sources: normalizeSources(parseJson(row.sources_json)),
    status: isStatus(row.status) ? row.status : "draft",
    verifiedBy: row.verified_by,
    sort: row.sort,
    updatedAt: row.updated_at,
  };
}

/** Ուղեցույցի հասցեն. link-ը՝ իր հղմամբ։ */
export function guidePath(guide: Pick<Guide, "slug" | "kind" | "link">) {
  return guide.kind === "link" && guide.link.startsWith("/") ? guide.link : `/church/${guide.slug}`;
}

/** Ադմինի ձևից՝ ստուգված արժեքներ (null՝ եթե ինչ-որ բան սխալ է)։ */
export function guideInput(form: { get(name: string): unknown }) {
  const slug = form.get("slug"), title = clean(form.get("title"), LIMIT.title);
  if (!isGuideSlug(slug) || !title) return null;
  const status = form.get("status");
  const link = clean(form.get("link"), LIMIT.line);
  return {
    slug,
    title,
    description: clean(form.get("description"), LIMIT.line),
    summary: clean(form.get("summary"), LIMIT.text),
    kind: (form.get("kind") === "link" ? "link" : "guide") as GuideKind,
    link: link.startsWith("/") ? link : "",
    icon: clean(form.get("icon"), 40),
    body: normalizeGuideBody(parseJson(String(form.get("body") ?? ""))),
    sources: normalizeSources(String(form.get("sources") ?? "")),
    status: isStatus(status) ? status : "draft" as GuideStatus,
    verifiedBy: clean(form.get("verifiedBy"), LIMIT.line),
    sort: Math.max(0, Math.min(9999, Math.round(Number(form.get("sort")) || 0))),
  };
}
export type GuideInput = NonNullable<ReturnType<typeof guideInput>>;

/** Կարգեր և վարքեր բաժնի մյուս խմբագիրները՝ /admin/guides էջում։ */
export const GUIDE_TOOLS: Array<{ to: string; title: string; note: string }> = [];
