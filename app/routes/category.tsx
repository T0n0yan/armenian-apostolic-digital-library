import { env } from "cloudflare:workers";
import { RotateCw, Search } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { isRouteErrorResponse, Link, useNavigation } from "react-router";

import type { Route } from "./+types/category";
import { getOptionalTelegramUser, getTelegramUserCacheScope } from "../auth/telegram-user.server";
import { MaterialResultCard } from "../components/material-result-card";
import { InfiniteLoadControls } from "../components/infinite-load-controls";
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
import { loadNavigationData, writeNavigationCache } from "../utils/navigation-cache";

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
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "")
    .trim()
    .slice(0, 120);
  const cursor = (url.searchParams.get("cursor") ?? "").slice(0, 2_000) || null;
  const [category, user] = await Promise.all([
    getActiveCategoryBySlug(env.DB, params.slug, request.signal),
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
      ? searchMaterials(env.DB, filters, cursor, 20, resolvedQuery, request.signal)
      : listPublicMaterialPageByCategory(env.DB, category.id, category.defaultSort, cursor, request.signal),
    user ? listSavedMaterialIds(env.DB, user.id) : Promise.resolve([]),
  ]);
  const materials = materialResult.materials;

  return {
    category,
    materials,
    query,
    total: materialResult.total,
    nextCursor: materialResult.nextCursor,
    highlightQuery: resolvedQuery?.highlightQuery ?? "",
    savedMaterialIds,
    canSave: Boolean(user),
    navigationCacheKey: `${url.pathname}${url.search}`,
    navigationCacheScope: await getTelegramUserCacheScope(user),
  };
}

type CategoryLoaderData = Awaited<ReturnType<typeof loader>>;

export async function clientLoader({ request, serverLoader }: Route.ClientLoaderArgs) {
  return loadNavigationData("topic-feed", request.url, async () => await serverLoader() as CategoryLoaderData);
}
clientLoader.hydrate = true as const;

const MaterialsList = memo(function MaterialsList({
  canSave,
  materials,
  savedMaterialIds,
  highlightQuery,
}: {
  canSave: boolean;
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
    <ol className="m-0 grid list-none gap-2.5 p-0 min-[860px]:grid-cols-2">
      {materials.map((material) =>
          <MaterialResultCard
            key={material.id}
            material={material}
            highlightQuery={highlightQuery}
            canSave={canSave}
            isSaved={savedIds.has(material.id)}
            isSaving={isSaving && pendingMaterialId === material.id}
            onSavedChange={handleSavedChange}
          />
      )}
    </ol>
  );
});

export default function Category({ loaderData }: Route.ComponentProps) {
  const { category } = loaderData;
  const stateKey = `${category.slug}|${loaderData.query}`;
  const [materials, setMaterials] = useState<CategoryMaterial[]>(loaderData.materials);
  const [nextCursor, setNextCursor] = useState<string | null>(loaderData.nextCursor);
  const [pageError, setPageError] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const stateKeyRef = useRef(stateKey);
  stateKeyRef.current = stateKey;
  const requestedCursorRef = useRef<string | null>(null);
  const seenCursorsRef = useRef(new Set<string>());
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
  useEffect(() => {
    abortRef.current?.abort();
    setMaterials(loaderData.materials);
    setNextCursor(loaderData.nextCursor);
    setPageError(false);
    setIsLoadingMore(false);
    requestedCursorRef.current = null;
    seenCursorsRef.current = new Set();
  }, [loaderData.materials, loaderData.nextCursor, stateKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    writeNavigationCache("topic-feed", loaderData.navigationCacheKey, loaderData.navigationCacheScope, {
      ...loaderData,
      materials,
      nextCursor,
    });
  }, [loaderData, materials, nextCursor]);

  const loadMore = useCallback(() => {
    if (!nextCursor || isLoadingMore || seenCursorsRef.current.has(nextCursor)) return;
    seenCursorsRef.current.add(nextCursor);
    requestedCursorRef.current = nextCursor;
    setPageError(false);
    setIsLoadingMore(true);
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const requestedKey = stateKey;
    const search = new URLSearchParams({ cursor: nextCursor });
    if (loaderData.query) search.set("q", loaderData.query);
    void fetch(`/api/categories/${category.slug}/posts?${search}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Page request failed: ${response.status}`);
        return await response.json() as { materials: CategoryMaterial[]; nextCursor: string | null };
      })
      .then((data) => {
        if (requestedKey !== stateKeyRef.current || controller.signal.aborted) return;
        setMaterials((current) => {
          const byId = new Map(current.map((material) => [material.id, material]));
          for (const material of data.materials) byId.set(material.id, material);
          return [...byId.values()];
        });
        setNextCursor(data.nextCursor && data.nextCursor !== requestedCursorRef.current ? data.nextCursor : null);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        seenCursorsRef.current.delete(nextCursor);
        setPageError(true);
      })
      .finally(() => {
        if (abortRef.current === controller) abortRef.current = null;
        if (!controller.signal.aborted) setIsLoadingMore(false);
      });
  }, [category.slug, isLoadingMore, loaderData.query, nextCursor, stateKey]);

  return (
    <PageShell>
      <SiteNav />
      <SectionHeader
        backTo="/"
        backLabel="Բաժիններ"
        imageSrc={getCategoryImage(category.id, category.name)}
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
          <MaterialListSkeleton count={4} />
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
            materials={materials}
            savedMaterialIds={loaderData.savedMaterialIds}
            highlightQuery={loaderData.highlightQuery}
          />
        )}
        {!isRefreshing && materials.length > 0 ? (
          <InfiniteLoadControls
            hasMore={Boolean(nextCursor)}
            isLoading={isLoadingMore}
            hasError={pageError}
            onLoadMore={loadMore}
          />
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
