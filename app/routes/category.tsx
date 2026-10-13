import { env } from "cloudflare:workers";
import { Bookmark, Search } from "lucide-react";
import { memo, useCallback } from "react";
import { isRouteErrorResponse, Link } from "react-router";

import type { Route } from "./+types/category";
import { getOptionalTelegramUser } from "../auth/telegram-user.server";
import {
  MaterialResultCard,
  openTelegramPost,
} from "../components/material-result-card";
import { EmptyState, PageHeader, PageShell } from "../components/page-layout";
import {
  getCategoryImage,
  SectionHeader,
} from "../components/section-header";
import { SiteNav } from "../components/site-nav";
import { countBadge, sectionHeader, sectionTitle } from "../components/ui-styles";
import { getActiveCategoryBySlug } from "../data/categories.server";
import type { PublicMaterial } from "../data/materials.server";
import { listPublicMaterialsByCategory } from "../data/materials.server";
import { listSavedMaterialIds } from "../data/saved-materials.server";
import type { SearchFilters, SearchMaterial } from "../data/search-materials";
import { searchMaterials } from "../data/search-materials.server";
import { resolveSearchQuery } from "../data/search-query.server";
import { useSavedMaterials } from "../hooks/use-saved-materials";

type CategoryMaterial = PublicMaterial | SearchMaterial;

const CATEGORY_SEARCH_PLACEHOLDERS: Record<string, string> = {
  category_saints_lives: "Փնտրել սրբի անունով…",
  category_gospel_teachings: "Փնտրել թեմա կամ հատված…",
  category_psalms: "Փնտրել սաղմոսի համարով կամ բառով…",
  category_bible_questions: "Փնտրել հարց կամ թեմա…",
  category_prayers: "Փնտրել աղոթք…",
  category_daily_readings: "Փնտրել ընթերցանություն…",
};

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.category.name ?? "Բաժին";
  return [
    { title: `${title} — Հոգևոր ժառանգություն` },
    { name: "robots", content: "noindex, nofollow" },
    { name: "theme-color", content: "#100817" },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const query = (new URL(request.url).searchParams.get("q") ?? "")
    .trim()
    .slice(0, 120);
  const [category, user] = await Promise.all([
    getActiveCategoryBySlug(env.DB, params.slug),
    getOptionalTelegramUser(request),
  ]);

  if (!category) {
    throw new Response("Category not found", {
      status: 404,
      statusText: "Not Found",
    });
  }

  const resolvedQuery = query ? await resolveSearchQuery(env.DB, query) : null;
  const filters: SearchFilters = {
    query,
    categoryId: category.id,
    scope: "library",
    dateFrom: "",
    dateTo: "",
  };
  const [materialResult, savedMaterialIds] = await Promise.all([
    query && resolvedQuery
      ? searchMaterials(env.DB, filters, 1, 200, resolvedQuery)
      : listPublicMaterialsByCategory(env.DB, category.id, category.defaultSort),
    user ? listSavedMaterialIds(env.DB, user.id) : Promise.resolve([]),
  ]);
  const materials = Array.isArray(materialResult)
    ? materialResult
    : materialResult.materials;

  return {
    category,
    materials,
    query,
    total: Array.isArray(materialResult) ? materialResult.length : materialResult.total,
    highlightQuery: resolvedQuery?.highlightQuery ?? "",
    savedMaterialIds,
    canSave: Boolean(user),
  };
}

const PsalmTile = memo(function PsalmTile({
  canSave,
  isSaved,
  isSaving,
  material,
  onSavedChange,
}: {
  canSave: boolean;
  isSaved: boolean;
  isSaving: boolean;
  material: PublicMaterial;
  onSavedChange: (materialId: string, saved: boolean) => void;
}) {
  return (
    <li className="relative animate-glass-enter">
      <a
        className="grid min-h-[50px] place-items-center rounded-[15px] border border-glass-border bg-[linear-gradient(145deg,rgb(255_255_255/7%),transparent_46%),var(--card-glass)] text-[14px] font-[750] text-ink no-underline shadow-card transition-[border-color,color,transform] duration-[160ms] hover:-translate-y-px hover:border-[rgb(217_181_111/34%)] hover:text-gold-bright focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgb(217_181_111/42%)]"
        href={material.telegramUrl}
        target="_blank"
        rel="noreferrer"
        title={material.title}
        aria-label={`${material.title} — բացել Telegram-ում`}
        onClick={openTelegramPost}
      >
        {material.numberValue}
      </a>
      {canSave ? (
        <button
          className={`absolute top-[3px] right-[3px] grid size-5 cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent p-0 disabled:cursor-wait disabled:opacity-60 ${isSaved ? "text-gold-bright" : "text-faint"}`}
          type="button"
          disabled={isSaving}
          onClick={() => onSavedChange(material.id, !isSaved)}
          aria-label={isSaved ? "Հեռացնել Իմ անկյունից" : "Պահել Իմ անկյունում"}
          title={isSaved ? "Հեռացնել Իմ անկյունից" : "Պահել Իմ անկյունում"}
        >
          <Bookmark
            aria-hidden="true"
            size={11}
            strokeWidth={2}
            fill={isSaved ? "currentColor" : "none"}
          />
        </button>
      ) : null}
    </li>
  );
});

const MaterialsList = memo(function MaterialsList({
  canSave,
  isPsalms,
  materials,
  savedMaterialIds,
  highlightQuery,
}: {
  canSave: boolean;
  isPsalms: boolean;
  materials: CategoryMaterial[];
  savedMaterialIds: string[];
  highlightQuery?: string;
}) {
  const { isSaving, pendingMaterialId, savedIds, setSaved } =
    useSavedMaterials(savedMaterialIds);
  const handleSavedChange = useCallback(
    (materialId: string, saved: boolean, personalNote = "") =>
      setSaved(materialId, saved, personalNote),
    [setSaved],
  );

  return (
    <ol className={`m-0 grid list-none p-0 ${isPsalms ? "grid-cols-[repeat(auto-fill,minmax(50px,1fr))] gap-2 min-[560px]:grid-cols-[repeat(auto-fill,minmax(58px,1fr))]" : "gap-2.5"}`}>
      {materials.map((material) =>
        isPsalms ? (
          <PsalmTile
            key={material.id}
            material={material}
            canSave={canSave}
            isSaved={savedIds.has(material.id)}
            isSaving={isSaving && pendingMaterialId === material.id}
            onSavedChange={handleSavedChange}
          />
        ) : (
          <MaterialResultCard
            key={material.id}
            material={material}
            highlightQuery={highlightQuery}
            canSave={canSave}
            isSaved={savedIds.has(material.id)}
            isSaving={isSaving && pendingMaterialId === material.id}
            onSavedChange={handleSavedChange}
          />
        ),
      )}
    </ol>
  );
});

export default function Category({ loaderData }: Route.ComponentProps) {
  const { category, materials } = loaderData;
  const isPsalms = category.id === "category_psalms";
  const searchPlaceholder = CATEGORY_SEARCH_PLACEHOLDERS[category.id] ??
    "Փնտրել այս բաժնում…";

  return (
    <PageShell>
      <SiteNav />
      <SectionHeader
        backTo="/"
        backLabel="Բաժիններ"
        imageSrc={getCategoryImage(category.id)}
        title={category.name}
        query={loaderData.query}
        searchAction={`/categories/${category.slug}`}
        searchLabel={`${category.name} բաժնում որոնում`}
        searchPlaceholder={searchPlaceholder}
      />

      <section className="grid gap-[11px]" aria-labelledby="category-materials-title">
        <div className={sectionHeader}>
          <h2 className={sectionTitle} id="category-materials-title">
            {loaderData.query ? "Գտնված նյութեր" : "Նյութեր"}
          </h2>
          <span className={countBadge}>{loaderData.total}</span>
        </div>

        {materials.length === 0 ? (
          loaderData.query ? (
            <EmptyState
              icon={<Search aria-hidden="true" size={28} strokeWidth={1.6} />}
              title={`«${loaderData.query}» բառով նյութ չկա`}
            >
              <p>Փորձիր մեկ այլ բառ կամ մաքրիր որոնումը։</p>
              <Link
                className="mt-[7px] inline-flex text-[12px] font-bold text-gold-bright no-underline"
                to={`/categories/${category.slug}`}
              >
                Ցույց տալ բոլոր նյութերը
              </Link>
            </EmptyState>
          ) : (
            <EmptyState><p>Այս բաժնում դեռ հրապարակված նյութ չկա։</p></EmptyState>
          )
        ) : (
          <MaterialsList
            canSave={loaderData.canSave}
            isPsalms={isPsalms}
            materials={materials}
            savedMaterialIds={loaderData.savedMaterialIds}
            highlightQuery={loaderData.highlightQuery}
          />
        )}
      </section>
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <PageShell>
      <SiteNav />
      <PageHeader
        backTo="/"
        backLabel="Բաժիններ"
        eyebrow="Հոգևոր ժառանգություն"
        title={isNotFound ? "Բաժինը չի գտնվել" : "Սխալ"}
        description={isNotFound
          ? "Այս բաժինը գոյություն չունի կամ հասանելի չէ։"
          : "Էջը բացելիս անսպասելի սխալ է տեղի ունեցել։"}
      />
    </PageShell>
  );
}
