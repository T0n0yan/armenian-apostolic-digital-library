/**
 * Օգնության (ուսուցողական) տեսանյութերը։ Ցանկը (վերնագրեր, կարգ) խմբագրում է ադմինը (/admin/help) և պահվում է
 * site_settings-ում («help_videos», app/data/help-videos.server.ts). եթե դեռ չի խմբագրվել՝ ստորևի սկզբնական ցանկը։
 * Ֆայլերը՝ R2-ում (help/…)։
 */
export const HELP_DEFAULTS: HelpItem[] = [
  { id: "lusavorutyun", title: "Ինչպես փոխել կայքի լուսավորությունը" },
  { id: "taratesak", title: "Տառատեսակ և տառաչափ" },
  { id: "voronum", title: "Ինչպես որոնել" },
  { id: "pahel-kardacel", title: "Պահել և նշել կարդացածը" },
  { id: "pahel-khosqy", title: "Պահել ընտրած խոսքը" },
  { id: "qartez", title: "Սրբավայրեր քարտեզում" },
  { id: "avelacnel-srbavayr", title: "Ավելացնել սրբավայր" },
  { id: "mutq", title: "Ինչպես մուտք գործել" },
  { id: "harc", title: "Պահել հարցը՝ հոգևորականին հարցնելու համար" },
  { id: "hishecum", title: "Հիշեցում կարդալու մասին" },
  { id: "lsel", title: "Լսել սաղմոսը" },
  { id: "bararan", title: "Անծանոթ բառեր" },
  { id: "glkhavor-ekran", title: "Կայքը՝ հավելվածի պես" },
];

export type HelpItem = { id: string; title: string };
/** Վերբեռնված ֆայլը (R2 key, չափը, երբ)։ */
export type HelpVideoFile = { key: string; size: number; updatedAt: string };
export type HelpConfig = { items: HelpItem[]; files: Record<string, HelpVideoFile>; onboarding: boolean };

/** Կայքում ցույց տրվող ցանկը՝ կարգով, հասցեով (կամ null, եթե դեռ վերբեռնված չէ)։ */
export type HelpVideo = { id: string; number: number; title: string; url: string | null };

export const HELP_TITLE_MAX = 120;
/** id-ն մտնում է ֆայլի անվան և հասցեի մեջ, ուստի միայն լատինատառ, թվեր, գծիկ։ */
export const isHelpId = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9-]{1,40}$/u.test(value);
export const cleanHelpTitle = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, HELP_TITLE_MAX) : "");

export function helpVideoUrl(key: string) {
  return `/help-media/${key.replace(/^help\//u, "")}`;
}

export function helpVideoList(config: HelpConfig): HelpVideo[] {
  return config.items.map((item, index) => {
    const file = config.files[item.id];
    return { id: item.id, number: index + 1, title: item.title, url: file ? helpVideoUrl(file.key) : null };
  });
}

