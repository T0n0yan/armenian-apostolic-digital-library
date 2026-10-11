export const SEARCH_MEDIA_TYPES = [
  "all",
  "text",
  "photo",
  "audio",
  "video",
  "poll",
] as const;

export type SearchMediaType = (typeof SEARCH_MEDIA_TYPES)[number];

export type SearchFilters = {
  query: string;
  categoryId: string;
  mediaType: SearchMediaType;
  dateFrom: string;
  dateTo: string;
};

export type SearchMaterial = {
  id: string;
  title: string;
  telegramUrl: string;
  categoryName: string;
  categorySlug: string;
  numberValue: number | null;
  dateValue: string | null;
  publishedAt: string | null;
  mediaTypes: string[];
  excerpt: string | null;
};

export type SearchMaterialPage = {
  materials: SearchMaterial[];
  total: number;
};
