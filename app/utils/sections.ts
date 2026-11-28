import type { ContentCategoryId } from "../../shared/telegram-bridge-contract";

/**
 * Բաժինների մեկ ցանկ. նոր բաժին ավելացնելիս տողը գրվում է այստեղ, մնացած ֆայլերը կարդում են սրանից։
 * Նկարն ու պատկերակը (import-ներ) մնում են իրենց ֆայլերում՝ `category-image.ts`, `category-icon.tsx`.
 * դրանք նույնպես `Record<ContentCategoryId, …>` են, ուստի բաց թողնելիս TypeScript-ը սխալ կտա։
 */
export type SectionLayout = "psalm-grid" | "portrait" | "text" | "video" | "calendar";
export type SectionCard = "text" | "video" | "psalm" | "portrait" | "daily";

export type SectionInfo = {
  /** Հասցեն՝ /psalms */
  slug: string;
  /** Հին հայերեն հասցեն (301)։ */
  oldSlug: string;
  /** Անունը կայքում։ */
  title: string;
  description: string;
  searchPlaceholder: string;
  layout: SectionLayout;
  /** Խառը ցուցակներում (որոնում, պահվածներ) քարտի տեսքը։ */
  card: SectionCard;
  /** Հղման նախադիտման նկարը՝ public/og/<og>.jpg */
  og: string;
  /** whole՝ ամբողջը միանգամից (ցանց, խմբեր), asc՝ գրքի կարգով (հինը առաջ)։ */
  feed: { whole: boolean; order: "asc" | "desc" };
  /** Կարդալու տառատեսակը նյութի էջում։ */
  reading: string;
  /** Առաջին տեքստային գրառումը բաժնի ներածությունն է։ */
  intro: boolean;
};

export const SECTIONS: Record<ContentCategoryId, SectionInfo> = {
  category_psalms: {
    slug: "psalms", oldSlug: "saghmosner", title: "Սաղմոսներ",
    description: "Սաղմոսները՝ ըստ համարի և բովանդակության։",
    searchPlaceholder: "Փնտրել սաղմոսի համարով կամ բառով…",
    layout: "psalm-grid", card: "psalm", og: "psalms", feed: { whole: true, order: "desc" }, reading: "prayer-text psalm-text", intro: true,
  },
  category_prayers: {
    slug: "pray", oldSlug: "aghotkner", title: "Աղոթքներ",
    description: "Աղոթքներ՝ առօրյա, տոնական և անձնական ընթերցման համար։",
    searchPlaceholder: "Փնտրել աղոթք…",
    layout: "text", card: "text", og: "prayers", feed: { whole: true, order: "asc" }, reading: "prayer-text", intro: true,
  },
  category_saints_lives: {
    slug: "saints", oldSlug: "srberi-varq", title: "Սրբերի վարքը",
    description: "Սրբերի վարքը՝ հավատքի և ծառայության օրինակներ։",
    searchPlaceholder: "Փնտրել սրբի անունով…",
    layout: "portrait", card: "portrait", og: "saints-lives", feed: { whole: false, order: "asc" }, reading: "sacred-text", intro: true,
  },
  category_gospel_teachings: {
    slug: "gospel", oldSlug: "avetarani-usutsum", title: "Ավետարանի ուսուցում",
    description: "Ավետարանի բացատրություններ Եկեղեցու հոգևորականներից։",
    searchPlaceholder: "Փնտրել թեմա կամ հատված…",
    layout: "video", card: "video", og: "gospel-teachings", feed: { whole: true, order: "desc" }, reading: "", intro: false,
  },
  category_daily_readings: {
    slug: "daily", oldSlug: "orva-entertsumner", title: "Օրվա ընթերցումներ",
    description: "Օրվա ընթերցումները, տոներն ու հիշատակությունները։",
    searchPlaceholder: "Փնտրել ընթերցանություն…",
    layout: "calendar", card: "daily", og: "daily-readings", feed: { whole: false, order: "desc" }, reading: "sacred-text", intro: false,
  },
  category_bible_questions: {
    slug: "questions", oldSlug: "hartser", title: "Հարցեր Աստվածաշնչից",
    description: "Հարցեր և բացատրություններ Աստվածաշնչի շուրջ։",
    searchPlaceholder: "Փնտրել հարց կամ թեմա…",
    layout: "text", card: "text", og: "bible-questions", feed: { whole: true, order: "desc" }, reading: "", intro: true,
  },
};

export const SECTION_IDS = Object.keys(SECTIONS) as ContentCategoryId[];

export function sectionInfo(id: string | null | undefined): SectionInfo | null {
  return id && id in SECTIONS ? SECTIONS[id as ContentCategoryId] : null;
}
