/**
 * Օգնության (ուսուցողական) տեսանյութերը՝ կարգով։ Վերնագրերը այստեղ են, ֆայլերը՝ R2-ում (help/…),
 * իսկ թե որն է վերբեռնված, պահվում է site_settings-ում («help_videos», app/data/help-videos.server.ts)։
 */
export const HELP_VIDEOS = [
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
] as const;

export type HelpVideoId = (typeof HELP_VIDEOS)[number]["id"];
export const isHelpVideoId = (value: unknown): value is HelpVideoId => HELP_VIDEOS.some((video) => video.id === value);

/** Վերբեռնված ֆայլը (R2 key, չափը, երբ)։ */
export type HelpVideoFile = { key: string; size: number; updatedAt: string };
export type HelpConfig = { files: Partial<Record<HelpVideoId, HelpVideoFile>>; onboarding: boolean };

/** Կայքում ցույց տրվող ցանկը՝ կարգով, հասցեով (կամ null, եթե դեռ վերբեռնված չէ)։ */
export type HelpVideo = { id: HelpVideoId; number: number; title: string; url: string | null };

export function helpVideoUrl(key: string) {
  return `/help-media/${key.replace(/^help\//u, "")}`;
}

export function helpVideoList(config: HelpConfig): HelpVideo[] {
  return HELP_VIDEOS.map((video, index) => {
    const file = config.files[video.id];
    return { id: video.id, number: index + 1, title: video.title, url: file ? helpVideoUrl(file.key) : null };
  });
}

/** Նոր այցելուին ցույց տալ ուղեցույցը (այս սարքում մեկ անգամ)։ */
export const HELP_ONBOARDING_KEY = "help-onboarding-seen";
