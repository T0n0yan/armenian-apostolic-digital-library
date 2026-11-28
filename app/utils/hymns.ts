// Շարականներ (`hymns`, migration 0063)։
import type { GuideStatus } from "./guides";

/** Ժամերը՝ Ժամերգությունների ուղեցույցի բլոկների id-ներով (/church/hours#gisherayin)։ */
export const HOURS = {
  gisherayin: "Գիշերային ժամ",
  aravotyan: "Առավոտյան ժամ",
  arevagal: "Արևագալի ժամ",
  errord: "Երրորդ ժամ",
  vetserord: "Վեցերորդ ժամ",
  innerord: "Իններորդ ժամ",
  yerekoyan: "Երեկոյան ժամ",
  khaghaghakan: "Խաղաղական ժամ",
  hangstyan: "Հանգստյան ժամ",
  patarag: "Սուրբ Պատարագ",
} as const;
export type Hour = keyof typeof HOURS;
export const isHour = (value: unknown): value is Hour => typeof value === "string" && value in HOURS;

/** Ութ ձայնեղանակները։ ⚑ Ճշտել անվանումները։ */
export const MODES = ["Ա ձայն", "Ա կողմ", "Բ ձայն", "Բ կողմ", "Գ ձայն", "Գ կողմ", "Դ ձայն", "Դ կողմ"];

export type Hymn = {
  id: number; title: string; feast: string; hour: Hour | ""; mode: string; performer: string;
  grabar: string; ashkharhabar: string; note: string; status: GuideStatus; sort: number;
};

export type HymnFilter = { feast?: string; hour?: string; mode?: string };

export function filterHymns<T extends Pick<Hymn, "feast" | "hour" | "mode">>(hymns: T[], filter: HymnFilter) {
  return hymns.filter((hymn) => (!filter.feast || hymn.feast === filter.feast) && (!filter.hour || hymn.hour === filter.hour) && (!filter.mode || hymn.mode === filter.mode));
}
