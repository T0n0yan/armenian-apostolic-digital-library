export type SearchFilters = {
  query: string;
  categoryId: string;
  scope: "library" | "saved";
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
  personalNote?: string;
};

export type SearchMaterialPage = {
  materials: SearchMaterial[];
  total: number;
  highlightQuery: string;
  nextCursor: string | null;
};

export type SearchCategoryGroup = {
  id: string;
  slug: string;
  name: string;
  materialCount: number;
  isPersonal?: boolean;
};
