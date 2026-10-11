import { env } from "cloudflare:workers";
import {
  ArrowRight,
  Bookmark,
  ChevronDown,
  Filter,
  LoaderCircle,
  RotateCcw,
  Search as SearchIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  type FormEvent,
  type SyntheticEvent,
} from "react";
import { Form, Link, useFetcher, useNavigation } from "react-router";

import type { Route } from "./+types/search";
import { getOptionalTelegramUser } from "../auth/telegram-user.server";
import { CategoryIcon } from "../components/category-icon";
import { MaterialResultCard } from "../components/material-result-card";
import { SiteNav } from "../components/site-nav";
import { listActiveCategories } from "../data/categories.server";
import {
  listSavedMaterialIds,
  listSavedMaterials,
} from "../data/saved-materials.server";
import {
  type SearchCategoryGroup,
  type SearchFilters,
  type SearchMaterial,
} from "../data/search-materials";
import {
  searchMaterialGroups,
  searchMaterials,
} from "../data/search-materials.server";
import { resolveSearchQuery } from "../data/search-query.server";
import { useSavedMaterials } from "../hooks/use-saved-materials";
import { useDebouncedFormSubmit } from "../hooks/use-debounced-form-submit";

function readDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function getPageHref(filters: SearchFilters, page: number) {
  const parameters = new URLSearchParams();
  if (filters.query) parameters.set("q", filters.query);
  if (filters.categoryId) parameters.set("category", filters.categoryId);
  if (filters.scope === "saved") parameters.set("scope", "saved");
  if (filters.dateFrom) parameters.set("from", filters.dateFrom);
  if (filters.dateTo) parameters.set("to", filters.dateTo);
  if (page > 1) parameters.set("page", String(page));
  return `/search?${parameters.toString()}`;
}

function getCategoryHref(filters: SearchFilters, group: SearchCategoryGroup) {
  const parameters = new URLSearchParams();
  if (filters.query) parameters.set("q", filters.query);
  if (group.isPersonal) parameters.set("scope", "saved");
  else parameters.set("category", group.id);
  if (filters.dateFrom) parameters.set("from", filters.dateFrom);
  if (filters.dateTo) parameters.set("to", filters.dateTo);
  return `/search?${parameters.toString()}`;
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Որոնում — Թվային գրադարան" },
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
  const hasCriteria = Boolean(
    query || categoryId || scope === "saved" || filters.dateFrom || filters.dateTo,
  );

  const [categories, user, resolvedQuery] = await Promise.all([
    listActiveCategories(env.DB),
    getOptionalTelegramUser(request),
    resolveSearchQuery(env.DB, query),
  ]);
  const [libraryGroups, libraryPage, allSavedMatches] = await Promise.all([
    hasCriteria && !categoryId && scope === "library"
      ? searchMaterialGroups(env.DB, filters, resolvedQuery)
      : Promise.resolve([]),
    hasCriteria && categoryId && scope === "library"
      ? searchMaterials(env.DB, filters, page, 30, resolvedQuery)
      : Promise.resolve({
          materials: [],
          total: 0,
          highlightQuery: resolvedQuery.highlightQuery,
        }),
    user && hasCriteria && !categoryId
      ? listSavedMaterials(env.DB, user.id, query, resolvedQuery)
      : Promise.resolve([]),
  ]);
  const savedMatches = allSavedMatches.filter((material) => {
    const date = material.dateValue || material.publishedAt?.slice(0, 10) || "";
    return (!filters.dateFrom || date >= filters.dateFrom) &&
      (!filters.dateTo || date <= filters.dateTo);
  });
  const savedMaterialIds = user && (categoryId || scope === "saved")
    ? await listSavedMaterialIds(env.DB, user.id)
    : [];
  const savedGroup: SearchCategoryGroup[] = savedMatches.length > 0
    ? [{
        id: "saved",
        slug: "saved",
        name: "Իմ անկյունը",
        materialCount: savedMatches.length,
        isPersonal: true,
      }]
    : [];
  const categoryGroups = scope === "library"
    ? [...savedGroup, ...libraryGroups]
    : [];
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
      personalNote: material.personalNote,
    }));
  const materials = scope === "saved" ? savedPageMaterials : libraryPage.materials;
  const total = scope === "saved"
    ? savedMatches.length
    : categoryId
      ? libraryPage.total
      : categoryGroups.reduce((sum, group) => sum + group.materialCount, 0);

  return {
    categories,
    categoryGroups,
    filters,
    hasCriteria,
    materials,
    total,
    page,
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
    useDebouncedFormSubmit(1_000);
  const navigation = useNavigation();
  const isSearching = navigation.location?.pathname === "/search";

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    cancelPending();
    if (!event.currentTarget.checkValidity()) event.preventDefault();
  }, [cancelPending]);

  return (
    <Form
      ref={formRef}
      className="search-panel"
      method="get"
      role="search"
      onSubmit={handleSubmit}
    >
      {filters.scope === "saved" ? (
        <input type="hidden" name="scope" value="saved" />
      ) : null}
      <div className="search-primary-field">
        <SearchIcon aria-hidden="true" size={20} strokeWidth={1.9} />
        <input
          type="search"
          name="q"
          defaultValue={filters.query}
          placeholder="Օրինակ՝ առակ, Սուրբ Մարիամ, աղոթք…"
          aria-label="Որոնման բառեր"
          autoComplete="off"
          onInput={scheduleSubmit}
        />
        <button type="submit" aria-label="Որոնել">
          {isSearching ? (
            <LoaderCircle className="search-loading-icon" aria-hidden="true" size={18} />
          ) : (
            <ArrowRight aria-hidden="true" size={18} />
          )}
        </button>
      </div>

      <details
        className="search-filters"
        open={Boolean(
          filters.categoryId ||
            filters.dateFrom ||
            filters.dateTo
        )}
      >
        <summary>
          <Filter aria-hidden="true" size={17} strokeWidth={1.9} />
          Զտել արդյունքները
          <ChevronDown
            className="search-filter-chevron"
            aria-hidden="true"
            size={18}
          />
        </summary>
        <div className="search-filter-grid">
          <label>
            <span>Բաժին</span>
            <select
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
          <label>
            <span>Սկսած</span>
            <input
              type="date"
              name="from"
              defaultValue={filters.dateFrom}
              onChange={submitImmediately}
            />
          </label>
          <label>
            <span>Մինչև</span>
            <input
              type="date"
              name="to"
              defaultValue={filters.dateTo}
              onChange={submitImmediately}
            />
          </label>
        </div>
        <div className="search-filter-actions">
          <Link to="/search">
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
    <ol className="materials-list search-results-list">
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

const SearchCategoryGroupItem = memo(function SearchCategoryGroupItem({
  filters,
  group,
}: {
  filters: SearchFilters;
  group: SearchCategoryGroup;
}) {
  const fetcher = useFetcher<typeof loader>();
  const handleToggle = useCallback(
    (event: SyntheticEvent<HTMLDetailsElement>) => {
      if (
        event.currentTarget.open &&
        fetcher.state === "idle" &&
        !fetcher.data
      ) {
        void fetcher.load(getCategoryHref(filters, group));
      }
    },
    [fetcher, filters, group],
  );

  return (
    <li>
      <details className="search-category-group" onToggle={handleToggle}>
        <summary>
          <span className="search-category-icon" aria-hidden="true">
            {group.isPersonal ? (
              <Bookmark size={22} strokeWidth={1.8} />
            ) : (
              <CategoryIcon categoryId={group.id} size={22} strokeWidth={1.8} />
            )}
          </span>
          <span className="search-category-copy">
            <strong>{group.name}</strong>
            <small>{group.materialCount} արդյունք</small>
          </span>
          <span className="search-category-count">{group.materialCount}</span>
          <ChevronDown
            className="search-category-chevron"
            aria-hidden="true"
            size={18}
            strokeWidth={1.9}
          />
        </summary>
        <div className="search-category-group-results">
          {fetcher.data ? (
            <SearchResults
              canSave={fetcher.data.canSave}
              allowNoteEditing={group.isPersonal}
              highlightQuery={fetcher.data.highlightQuery}
              materials={fetcher.data.materials}
              savedMaterialIds={fetcher.data.savedMaterialIds}
            />
          ) : (
            <span className="search-category-loading" role="status">
              <LoaderCircle
                className="search-loading-icon"
                aria-hidden="true"
                size={18}
              />
              Բացվում է…
            </span>
          )}
        </div>
      </details>
    </li>
  );
});

const SearchCategoryGroups = memo(function SearchCategoryGroups({
  filters,
  groups,
}: {
  filters: SearchFilters;
  groups: SearchCategoryGroup[];
}) {
  return (
    <ol className="search-category-groups">
      {groups.map((group) => (
        <SearchCategoryGroupItem
          key={group.id}
          filters={filters}
          group={group}
        />
      ))}
    </ol>
  );
});

export default function Search({ loaderData }: Route.ComponentProps) {
  const {
    categories,
    categoryGroups,
    filters,
    hasCriteria,
    materials,
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

  return (
    <main className="search-page">
      <SiteNav actionHref="/" actionLabel="← Գրադարան" />
      <header className="search-header">
        <p className="library-kicker">Ամբողջ գրադարանը</p>
        <h1>Որոնում</h1>
        <p>Փնտրիր վերնագրերի և Telegram-ից ներմուծված ամբողջ տեքստի մեջ։</p>
      </header>

      <SearchForm categories={categories} filters={filters} />

      {loaderData.correctedQuery ? (
        <p className="search-correction" role="status">
          Հասկացանք նաև՝ <strong>{loaderData.correctedQuery}</strong>
        </p>
      ) : null}

      <section className="search-results" aria-live="polite">
        {hasCriteria ? (
          <div className="section-heading search-results-heading">
            <h2>{selectedTitle}</h2>
            <span>{total}</span>
          </div>
        ) : null}

        {!hasCriteria ? (
          <div className="search-empty-state">
            <SearchIcon aria-hidden="true" size={26} strokeWidth={1.6} />
            <h2>Գրիր այն, ինչ փնտրում ես</h2>
            <p>Կարող ես որոնել նաև բաժնով, ամսաթվով կամ Telegram հղումով։</p>
          </div>
        ) : categoryGroups.length === 0 && materials.length === 0 ? (
          <div className="search-empty-state">
            <SearchIcon aria-hidden="true" size={26} strokeWidth={1.6} />
            <h2>Համապատասխան նյութ չգտնվեց</h2>
            <p>Փորձիր ավելի կարճ բառ կամ հանիր զտիչներից մեկը։</p>
          </div>
        ) : !filters.categoryId && filters.scope !== "saved" ? (
          <SearchCategoryGroups filters={filters} groups={categoryGroups} />
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
        totalPages > 1 ? (
          <nav className="search-pagination" aria-label="Որոնման էջեր">
            {page > 1 ? (
              <Link to={getPageHref(filters, page - 1)}>← Նախորդ</Link>
            ) : (
              <span />
            )}
            <span>
              {page} / {totalPages}
            </span>
            {page < totalPages ? (
              <Link to={getPageHref(filters, page + 1)}>Հաջորդ →</Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
