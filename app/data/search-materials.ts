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
  contentType: BridgeContentType;
  preview: MaterialCardPreview;
  personalNote?: string;
  matchReasons?: Array<"telegram" | "personal-note">;
};

export type SearchMaterialPage = {
  materials: SearchMaterial[];
  total: number;
  highlightQuery: string;
  nextCursor: string | null;
};

import type { BridgeContentType } from "../../shared/telegram-bridge-contract";
import type { MaterialCardPreview } from "./materials.server";
