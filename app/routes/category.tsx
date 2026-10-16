import { env } from "cloudflare:workers";
import { Bookmark, RotateCw, Search } from "lucide-react";
import { memo, useCallback } from "react";
import { isRouteErrorResponse, Link, useNavigation } from "react-router";

import type { Route } from "./+types/category";
import { getOptionalTelegramUser } from "../auth/telegram-user.server";
import { MaterialResultCard } from "../components/material-result-card";
import { EmptyState, PageHeader, PageShell } from "../components/page-layout";
import { MaterialListSkeleton } from "../components/material-skeleton";
import {
  getCategoryImage,
  SectionHeader,
} from "../components/section-header";
import { SiteNav } from "../components/site-nav";
import { countBadge, sectionHeader, sectionTitle } from "../components/ui-styles";
import { getActiveCategoryBySlug } from "../data/categories.server";
import type { PublicMaterial } from "../data/materials.server";
import { listPublicMaterialPageByCategory } from "../data/materials.server";
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

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  category_saints_lives: "Վկայություններ սրբերի կյանքի, հավատքի և ծառայության մասին։",
  category_gospel_teachings: "Ավետարանական մեկնություններ և հոգևոր ուղեցույցներ։",
  category_psalms: "Սաղմոսները՝ ըստ համարի և բովանդակության։",
  category_bible_questions: "Հարցեր և բացատրություններ Աստվածաշնչի շուրջ։",
  category_prayers: "Աղոթքներ՝ առօրյա, տոնական և անձնական ընթերցման համար։",
  category_daily_readings: "Օրվա ընթերցվածքները, հիշատակությունները և տոնացույցը։",
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
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "")
    .trim()
    .slice(0, 120);
  const requestedPage = Number(url.searchParams.get("page"));
  const page = Number.isInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, 1_000)
    : 1;
  const cursor = (url.searchParams.get("cursor") ?? "").slice(0, 2_000) || null;
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
      ? searchMaterials(env.DB, filters, cursor, 30, resolvedQuery)
      : listPublicMaterialPageByCategory(env.DB, category.id, category.defaultSort, cursor),
    user ? listSavedMaterialIds(env.DB, user.id) : Promise.resolve([]),
  ]);
  const materials = materialResult.materials;

  return {
    category,
    materials,
    query,
    total: materialResult.total,
    page,
    nextCursor: materialResult.nextCursor,
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
      <Link
        className="grid min-h-[50px] place-items-center rounded-[15px] border border-glass-border bg-[linear-gradient(145deg,rgb(255_255_255/7%),transparent_46%),var(--card-glass)] text-[14px] font-[750] text-ink no-underline shadow-card transition-[border-color,color,transform] duration-[160ms] hover:-translate-y-px hover:border-[rgb(217_181_111/34%)] hover:text-gold-bright focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgb(217_181_111/42%)]"
        to={`/materials/${material.id}`}
        title={material.title}
        aria-label={`${material.title} — բացել հավելվածում`}
      >
        {material.numberValue}
      </Link>
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
    <ol className={`m-0 grid list-none p-0 ${isPsalms ? "grid-cols-[repeat(auto-fill,minmax(50px,1fr))] gap-2 min-[560px]:grid-cols-[repeat(auto-fill,minmax(58px,1fr))]" : "gap-2.5 min-[860px]:grid-cols-2"}`}>
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
    "Փնտրել այս թեմայում…";
  const categoryDescription = CATEGORY_DESCRIPTIONS[category.id]
    ?? (category.isGeneral
      ? "Telegram ֆորումի հիմնական թեմայի հրապարակումները։"
      : category.status === "closed"
        ? "Այս Telegram թեման փակված է, սակայն հրապարակումները հասանելի են ընթերցման համար։"
        : "Telegram ֆորումի այս թեմայի հրապարակումները։");
  const navigation = useNavigation();
  const isRefreshing = navigation.state === "loading" &&
    navigation.location?.pathname === `/categories/${category.slug}`;
  const pageHref = (page: number, cursor: string | null) => {
    const search = new URLSearchParams();
    if (loaderData.query) search.set("q", loaderData.query);
    if (page > 1) search.set("page", String(page));
    if (cursor) search.set("cursor", cursor);
    const suffix = search.toString();
    return `/categories/${category.slug}${suffix ? `?${suffix}` : ""}`;
  };

  return (
    <PageShell>
      <SiteNav />
      <SectionHeader
        backTo="/"
        backLabel="Բաժիններ"
        imageSrc={getCategoryImage(category.id)}
        title={category.name}
        description={categoryDescription}
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
          <span className={countBadge}>{loaderData.total ?? materials.length}</span>
        </div>

        {isRefreshing ? (
          <MaterialListSkeleton count={isPsalms ? 8 : 4} />
        ) : materials.length === 0 ? (
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
        {!isRefreshing && materials.length > 0 && (loaderData.page > 1 || loaderData.nextCursor) ? (
          <nav className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 px-1 pt-3.5 text-[12px] text-faint tabular-nums [&_a]:w-fit [&_a]:font-[720] [&_a]:text-gold-bright [&_a]:no-underline [&_a:last-of-type]:justify-self-end" aria-label="Բաժնի էջեր">
            {loaderData.page > 1 ? <Link to={pageHref(1, null)}>← Սկիզբ</Link> : <span />}
            <span>{loaderData.page}</span>
            {loaderData.nextCursor ? <Link to={pageHref(loaderData.page + 1, loaderData.nextCursor)}>Հաջորդ →</Link> : <span />}
          </nav>
        ) : null}
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
      {!isNotFound ? (
        <button className="mt-4 inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-[13px] border border-glass-border bg-subtle px-4 text-[12px] font-bold text-gold-bright" type="button" onClick={() => window.location.reload()}>
          <RotateCw aria-hidden="true" size={16} /> Կրկին փորձել
        </button>
      ) : null}
    </PageShell>
  );
}
