import { env } from "cloudflare:workers";
import {
  ArrowRight,
  ChevronDown,
  Filter,
  LoaderCircle,
  RotateCcw,
  Search as SearchIcon,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  type FormEvent,
} from "react";
import { Form, Link, useNavigation } from "react-router";

import type { Route } from "./+types/search";
import { getOptionalTelegramUser } from "../auth/telegram-user.server";
import { MaterialResultCard } from "../components/material-result-card";
import { MaterialListSkeleton } from "../components/material-skeleton";
import { EmptyState, PageHeader, PageShell, RouteErrorState } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import {
  countBadge,
  fieldControl,
  fieldLabel,
  sectionHeader,
  sectionTitle,
} from "../components/ui-styles";
import { listActiveCategories } from "../data/categories.server";
import {
  listSavedMaterialIds,
  listSavedMaterials,
  searchSavedMaterialNotes,
} from "../data/saved-materials.server";
import {
  type SearchFilters,
  type SearchMaterial,
} from "../data/search-materials";
import {
  searchMaterials,
} from "../data/search-materials.server";
import { recordSearchAggregate } from "../data/search-analytics.server";
import { resolveSearchQuery } from "../data/search-query.server";
import { useSavedMaterials } from "../hooks/use-saved-materials";
import { useDebouncedFormSubmit } from "../hooks/use-debounced-form-submit";

function readDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

const searchRank = {
  "message-id": 9,
  "exact-primary": 8,
  "personal-note": 7,
  "exact-token": 6,
  prefix: 5,
  content: 4,
  transliteration: 3,
  fuzzy: 2,
} as const;

function stableSearchOrder(left: SearchMaterial, right: SearchMaterial) {
  const scoreDifference = (searchRank[right.scoreCategory ?? "content"] ?? 0) - (searchRank[left.scoreCategory ?? "content"] ?? 0);
  return scoreDifference || (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "") || left.id.localeCompare(right.id);
}

function noteReasons(material: Awaited<ReturnType<typeof searchSavedMaterialNotes>>[number]): SearchMaterial["matchReasons"] {
  const details = material.noteSearchMatch?.reasons.filter((reason) => reason === "transliteration" || reason === "fuzzy") ?? [];
  return ["personal-note", ...details];
}

export function getPageHref(filters: SearchFilters, page: number, cursor: string | null = null) {
  const parameters = new URLSearchParams();
  if (filters.query) parameters.set("q", filters.query);
  if (filters.categoryId) parameters.set("category", filters.categoryId);
  if (filters.scope === "saved") parameters.set("scope", "saved");
  if (filters.dateFrom) parameters.set("from", filters.dateFrom);
  if (filters.dateTo) parameters.set("to", filters.dateTo);
  if (page > 1) parameters.set("page", String(page));
  if (cursor) parameters.set("cursor", cursor);
  return `/search?${parameters.toString()}`;
}

export function getClearQueryHref(filters: SearchFilters) {
  return getPageHref({ ...filters, query: "" }, 1);
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Որոնում — Հոգևոր ժառանգություն" },
    { name: "robots", content: "noindex, nofollow" },
    { name: "theme-color", content: "#100817" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const categoryId = (url.searchParams.get("category") ?? "").slice(0, 80);
  const scope = url.searchParams.get("scope") === "saved" ? "saved" : "library";
  const filters: SearchFilters = {
    query,
    categoryId,
    scope,
    dateFrom: readDate(url.searchParams.get("from")),
    dateTo: readDate(url.searchParams.get("to")),
  };
  const requestedPage = Number(url.searchParams.get("page"));
  const page = Number.isInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, 1_000)
    : 1;
  const cursor = (url.searchParams.get("cursor") ?? "").slice(0, 2_000) || null;
  const hasSearchQuery = Array.from(query).length >= 2;
  const hasCriteria = Boolean(hasSearchQuery || categoryId || scope === "saved");
  const effectiveFilters = hasSearchQuery ? filters : { ...filters, query: "" };

  const [categories, user, resolvedQuery] = await Promise.all([
    listActiveCategories(env.DB, false, request.signal),
    getOptionalTelegramUser(request),
    resolveSearchQuery(env.DB, query),
  ]);
  const [libraryPage, allSavedMatches, personalNoteMatches, savedMaterialIds] = await Promise.all([
    hasCriteria && scope === "library"
      ? searchMaterials(env.DB, effectiveFilters, cursor, 30, resolvedQuery, request.signal)
      : Promise.resolve({
          materials: [],
          total: 0,
          highlightQuery: resolvedQuery.highlightQuery,
          nextCursor: null,
        }),
    user && scope === "saved"
      ? listSavedMaterials(env.DB, user.id, query, resolvedQuery, request.signal)
      : Promise.resolve([]),
    user && scope === "library" && hasSearchQuery && !categoryId
      ? searchSavedMaterialNotes(env.DB, user.id, resolvedQuery, request.signal)
      : Promise.resolve([]),
    user && hasCriteria
      ? listSavedMaterialIds(env.DB, user.id)
      : Promise.resolve([]),
  ]);
  const savedMatches = allSavedMatches.filter((material) => {
    const date = material.dateValue || material.publishedAt?.slice(0, 10) || "";
    return (!filters.dateFrom || date >= filters.dateFrom) &&
      (!filters.dateTo || date <= filters.dateTo);
  });
  const savedPageMaterials: SearchMaterial[] = savedMatches
    .slice((page - 1) * 30, page * 30)
    .map((material) => ({
      id: material.id,
      title: material.title,
      telegramUrl: material.telegramUrl,
      categoryName: material.categoryName,
      categorySlug: material.categorySlug,
      numberValue: material.numberValue,
      dateValue: material.dateValue,
      publishedAt: material.publishedAt,
      mediaTypes: material.mediaTypes,
      excerpt: material.excerpt,
      contentType: material.contentType,
      preview: material.preview,
      personalNote: material.personalNote,
      matchReasons: noteReasons(material),
      scoreCategory: material.noteSearchMatch?.scoreCategory === "fuzzy" || material.noteSearchMatch?.scoreCategory === "transliteration"
        ? material.noteSearchMatch.scoreCategory
        : "personal-note",
    }));
  const noteMaterials: SearchMaterial[] = personalNoteMatches.map((material) => ({
    id: material.id,
    title: material.title,
    telegramUrl: material.telegramUrl,
    categoryName: material.categoryName,
    categorySlug: material.categorySlug,
    numberValue: material.numberValue,
    dateValue: material.dateValue,
    publishedAt: material.publishedAt,
    mediaTypes: material.mediaTypes,
    excerpt: material.excerpt,
    contentType: material.contentType,
    preview: material.preview,
    personalNote: material.personalNote,
    matchReasons: noteReasons(material),
    scoreCategory: material.noteSearchMatch?.scoreCategory === "fuzzy" || material.noteSearchMatch?.scoreCategory === "transliteration"
      ? material.noteSearchMatch.scoreCategory
      : "personal-note",
  }));
  const noteById = new Map(noteMaterials.map((material) => [material.id, material]));
  const telegramMaterials = libraryPage.materials.map((material) => {
    const noteMatch = noteById.get(material.id);
    if (!noteMatch) return material;
    noteById.delete(material.id);
    return {
      ...material,
      personalNote: noteMatch.personalNote,
      matchReasons: [...new Set([...(material.matchReasons ?? ["telegram"]), ...(noteMatch.matchReasons ?? ["personal-note"])])],
      scoreCategory: (searchRank[noteMatch.scoreCategory ?? "personal-note"] ?? 0) > (searchRank[material.scoreCategory ?? "content"] ?? 0)
        ? noteMatch.scoreCategory
        : material.scoreCategory,
    };
  });
  const personalMaterials = [...noteById.values()].sort(stableSearchOrder);
  const materials = (scope === "saved" ? savedPageMaterials : telegramMaterials).sort(stableSearchOrder);
  const total = scope === "saved"
    ? savedMatches.length
    : telegramMaterials.length + personalMaterials.length;

  if (hasSearchQuery && scope === "library") {
    await recordSearchAggregate(
      env.DB,
      resolvedQuery.normalized,
      categoryId,
      total,
      env.TELEGRAM_BRIDGE_SHARED_SECRET,
    ).catch(() => {
      console.warn(JSON.stringify({ event: "search_analytics_write", outcome: "error" }));
    });
  }

  return {
    categories,
    filters,
    hasCriteria,
    materials,
    personalMaterials,
    total,
    page,
    nextCursor: scope === "saved" ? null : libraryPage.nextCursor,
    savedMaterialIds,
    canSave: Boolean(user),
    highlightQuery: resolvedQuery.highlightQuery,
    correctedQuery: resolvedQuery.correctedQuery,
  };
}

const SearchForm = memo(function SearchForm({
  categories,
  filters,
}: {
  categories: Route.ComponentProps["loaderData"]["categories"];
  filters: SearchFilters;
}) {
  const { cancelPending, formRef, scheduleSubmit, submitImmediately } =
    useDebouncedFormSubmit(320, 2);
  const navigation = useNavigation();
  const isSearching = navigation.state !== "idle" && navigation.location?.pathname === "/search";

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    cancelPending();
    if (!event.currentTarget.checkValidity()) event.preventDefault();
  }, [cancelPending]);

  return (
    <Form
      ref={formRef}
      className="grid min-w-0 gap-3 rounded-[22px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] p-3 shadow-glass"
      method="get"
      role="search"
      onSubmit={handleSubmit}
      aria-busy={isSearching || undefined}
    >
      {filters.scope === "saved" ? (
        <input type="hidden" name="scope" value="saved" />
      ) : null}
      <div className="flex min-h-[52px] w-full min-w-0 items-center gap-2.5 rounded-2xl border border-glass-border bg-control pl-[13px] text-faint">
        <SearchIcon aria-hidden="true" size={20} strokeWidth={1.9} />
        <input
          className="min-w-0 flex-1 border-0 bg-transparent text-ink outline-none placeholder:text-faint"
          type="search"
          name="q"
          defaultValue={filters.query}
          placeholder="Օրինակ՝ առակ, Սուրբ Մարիամ, աղոթք…"
          aria-label="Որոնման բառեր"
          autoComplete="off"
          minLength={2}
          onInput={scheduleSubmit}
        />
        {filters.query ? <Link className="grid size-9 shrink-0 place-items-center rounded-[10px] text-muted no-underline hover:text-gold-bright" to={getClearQueryHref(filters)} aria-label="Մաքրել որոնումը"><X aria-hidden="true" size={17} /></Link> : null}
        <button className="m-[5px] min-h-10 self-stretch rounded-xl border border-[rgb(240_211_151/24%)] bg-[linear-gradient(135deg,#7b4a8e,#5c326d)] px-4 font-[750] text-[#fffaf3] disabled:cursor-wait disabled:opacity-70" type="submit" aria-label="Որոնել" disabled={isSearching}>
          {isSearching ? (
            <LoaderCircle className="animate-search-spin" aria-hidden="true" size={18} />
          ) : (
            <ArrowRight aria-hidden="true" size={18} />
          )}
        </button>
      </div>

      <details
        className="group w-full min-w-0 overflow-hidden rounded-2xl border border-glass-border bg-subtle"
        open={Boolean(
          filters.categoryId ||
            filters.dateFrom ||
            filters.dateTo
        )}
      >
        <summary className="flex min-h-[46px] cursor-pointer list-none items-center gap-2 px-3.5 text-[13px] font-[720] text-muted">
          <Filter aria-hidden="true" size={17} strokeWidth={1.9} />
          Զտել արդյունքները
          <ChevronDown
            className="ml-auto transition-transform duration-[180ms] group-open:rotate-180"
            aria-hidden="true"
            size={18}
          />
        </summary>
        <div className="grid gap-2.5 px-3 pt-1 pb-3 min-[560px]:grid-cols-2 min-[960px]:grid-cols-[1.4fr_1fr_1fr]">
          <label className={fieldLabel}>
            <span>Բաժին</span>
            <select
              className={`${fieldControl} pr-[42px]`}
              name="category"
              defaultValue={filters.categoryId}
              onChange={submitImmediately}
            >
              <option value="">Բոլոր բաժինները</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldLabel}>
            <span>Սկսած</span>
            <input
              className={fieldControl}
              type="date"
              name="from"
              defaultValue={filters.dateFrom}
              onChange={submitImmediately}
            />
          </label>
          <label className={fieldLabel}>
            <span>Մինչև</span>
            <input
              className={fieldControl}
              type="date"
              name="to"
              defaultValue={filters.dateTo}
              onChange={submitImmediately}
            />
          </label>
        </div>
        <div className="flex items-center gap-3.5 px-3 pb-3">
          <Link className="inline-flex items-center gap-1.5 text-[12px] font-[720] text-gold-bright no-underline" to="/search">
            <RotateCcw aria-hidden="true" size={15} /> Մաքրել
          </Link>
        </div>
      </details>
    </Form>
  );
});

const SearchResults = memo(function SearchResults({
  canSave,
  highlightQuery,
  materials,
  savedMaterialIds,
  allowNoteEditing = false,
}: {
  canSave: boolean;
  highlightQuery: string;
  materials: SearchMaterial[];
  savedMaterialIds: string[];
  allowNoteEditing?: boolean;
}) {
  const { isSaving, pendingMaterialId, savedIds, setSaved } =
    useSavedMaterials(savedMaterialIds);
  const handleSavedChange = useCallback(
    (materialId: string, saved: boolean, personalNote = "") =>
      setSaved(materialId, saved, personalNote),
    [setSaved],
  );

  return (
    <ol className="m-0 grid list-none gap-2.5 p-0">
      {materials.map((material) => (
        <MaterialResultCard
          key={material.id}
          material={material}
          allowNoteEditing={allowNoteEditing}
          canSave={canSave}
          highlightQuery={highlightQuery}
          isSaved={savedIds.has(material.id)}
          isSaving={isSaving && pendingMaterialId === material.id}
          onSavedChange={handleSavedChange}
        />
      ))}
    </ol>
  );
});

export default function Search({ loaderData }: Route.ComponentProps) {
  const {
    categories,
    filters,
    hasCriteria,
    materials,
    personalMaterials,
    page,
    total,
  } = loaderData;
  const totalPages = Math.max(1, Math.ceil(total / 30));
  const selectedCategory = categories.find(
    (category) => category.id === filters.categoryId,
  );
  const selectedTitle = filters.scope === "saved"
    ? "Իմ անկյունը"
    : selectedCategory?.name ?? "Համապատասխան բաժիններ";
  const navigation = useNavigation();
  const isRefreshing = navigation.state === "loading" && navigation.location?.pathname === "/search";

  return (
    <PageShell>
      <SiteNav />
      <PageHeader
        backTo="/"
        backLabel="Գրադարան"
        eyebrow="Ամբողջ գրադարանը"
        title="Որոնում"
        description="Փնտրիր Telegram հրապարակումների վերնագրերի և ամբողջ տեքստի մեջ։"
      />

      <SearchForm
        key={`${filters.query}|${filters.categoryId}|${filters.scope}|${filters.dateFrom}|${filters.dateTo}`}
        categories={categories}
        filters={filters}
      />

      {loaderData.correctedQuery ? (
        <p className="mx-1 mt-3 mb-0 text-[13px] text-muted [&_strong]:text-gold-bright" role="status">
          Որոնումը ներառում է նաև տառադարձումը՝ <strong>{loaderData.correctedQuery}</strong>
        </p>
      ) : null}

      <section className="mt-4 grid gap-3" aria-live="polite" aria-busy={isRefreshing || undefined}>
        {hasCriteria ? (
          <div className={sectionHeader}>
            <h2 className={sectionTitle}>{selectedTitle}</h2>
            <span className={countBadge}>{total}</span>
          </div>
        ) : null}

        {isRefreshing ? (
          <MaterialListSkeleton />
        ) : !hasCriteria ? (
          <EmptyState icon={<SearchIcon aria-hidden="true" size={26} strokeWidth={1.6} />} title="Գրիր այն, ինչ փնտրում ես">
            <p>Կարող ես որոնել նաև բաժնով, ամսաթվով կամ Telegram հղումով։</p>
          </EmptyState>
        ) : personalMaterials.length === 0 && materials.length === 0 ? (
          <EmptyState
            icon={<SearchIcon aria-hidden="true" size={26} strokeWidth={1.6} />}
            title={filters.categoryId ? "Այս թեմայում արդյունք չգտնվեց" : "Համապատասխան նյութ չգտնվեց"}
          >
            <p>Փորձիր ավելի կարճ բառ կամ հանիր զտիչներից մեկը։</p>
            {filters.categoryId && filters.query ? (
              <Link
                className="mt-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[rgb(217_181_111/34%)] bg-[linear-gradient(135deg,#7b4a8e,#5c326d)] px-4 py-2.5 text-[13px] font-[760] text-[#fffaf3] no-underline shadow-glass active:scale-[.985]"
                to={getPageHref({ ...filters, categoryId: "" }, 1)}
                prefetch="intent"
              >
                Փնտրել բոլոր թեմաներում <ArrowRight aria-hidden="true" size={16} />
              </Link>
            ) : null}
          </EmptyState>
        ) : !filters.categoryId && filters.scope !== "saved" ? (
          <div className="grid gap-3">
            {materials.length ? (
              <section className="grid gap-2.5" aria-labelledby="telegram-search-results">
                <div className={sectionHeader}>
                  <h3 className={sectionTitle} id="telegram-search-results">Telegram նյութեր</h3>
                  <span className={countBadge}>{materials.length}</span>
                </div>
                <SearchResults
                  canSave={loaderData.canSave}
                  allowNoteEditing={false}
                  highlightQuery={loaderData.highlightQuery}
                  materials={materials}
                  savedMaterialIds={loaderData.savedMaterialIds}
                />
              </section>
            ) : null}
            {personalMaterials.length ? (
              <section className="grid gap-2.5" aria-labelledby="personal-note-search-results">
                <div className={sectionHeader}>
                  <h3 className={sectionTitle} id="personal-note-search-results">Իմ նշումներից</h3>
                  <span className={countBadge}>{personalMaterials.length}</span>
                </div>
                <SearchResults
                  canSave={loaderData.canSave}
                  allowNoteEditing
                  highlightQuery={loaderData.highlightQuery}
                  materials={personalMaterials}
                  savedMaterialIds={loaderData.savedMaterialIds}
                />
              </section>
            ) : null}
          </div>
        ) : (
          <SearchResults
            canSave={loaderData.canSave}
            allowNoteEditing={filters.scope === "saved"}
            highlightQuery={loaderData.highlightQuery}
            materials={materials}
            savedMaterialIds={loaderData.savedMaterialIds}
          />
        )}
        {hasCriteria &&
        (filters.categoryId || filters.scope === "saved") &&
        (filters.scope === "saved" ? totalPages > 1 : Boolean(loaderData.nextCursor) || page > 1) ? (
          <nav className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 px-1 pt-3.5 text-[12px] text-faint tabular-nums [&_a]:w-fit [&_a]:font-[720] [&_a]:text-gold-bright [&_a]:no-underline [&_a:last-of-type]:justify-self-end" aria-label="Որոնման էջեր">
            {page > 1 ? (
              <Link to={getPageHref(filters, 1)}>← Սկիզբ</Link>
            ) : (
              <span />
            )}
            <span>
              {filters.scope === "saved" ? `${page} / ${totalPages}` : page}
            </span>
            {(filters.scope === "saved" ? page < totalPages : Boolean(loaderData.nextCursor)) ? (
              <Link to={getPageHref(filters, page + 1, loaderData.nextCursor)}>Հաջորդ →</Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </PageShell>
  );
}

export function ErrorBoundary({}: Route.ErrorBoundaryProps) {
  return <PageShell><SiteNav /><PageHeader backTo="/" backLabel="Գրադարան" eyebrow="Ամբողջ գրադարանը" title="Որոնում" /><RouteErrorState title="Որոնումը չհաջողվեց" /></PageShell>;
}
