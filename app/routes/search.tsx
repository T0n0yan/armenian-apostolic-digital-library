import { env } from "cloudflare:workers";
import {
  ArrowRight,
  Filter,
  LoaderCircle,
  RotateCcw,
  Search as SearchIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useRef, type FormEvent } from "react";
import { Form, Link, useNavigation, useSubmit } from "react-router";

import type { Route } from "./+types/search";
import { getOptionalTelegramUser } from "../auth/telegram-user.server";
import { CategoryIcon } from "../components/category-icon";
import { MaterialResultCard } from "../components/material-result-card";
import { SiteNav } from "../components/site-nav";
import { listActiveCategories } from "../data/categories.server";
import { listSavedMaterialIds } from "../data/saved-materials.server";
import {
  SEARCH_MEDIA_TYPES,
  type SearchCategoryGroup,
  type SearchFilters,
  type SearchMaterial,
} from "../data/search-materials";
import {
  searchMaterialGroups,
  searchMaterials,
} from "../data/search-materials.server";
import { useSavedMaterials } from "../hooks/use-saved-materials";

const mediaLabels = {
  all: "Բոլոր տեսակները",
  text: "Տեքստ",
  photo: "Նկար",
  audio: "Աուդիո",
  video: "Վիդեո",
  poll: "Հարցում",
} as const;

function readDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function getPageHref(filters: SearchFilters, page: number) {
  const parameters = new URLSearchParams();
  if (filters.query) parameters.set("q", filters.query);
  if (filters.categoryId) parameters.set("category", filters.categoryId);
  if (filters.mediaType !== "all") parameters.set("media", filters.mediaType);
  if (filters.dateFrom) parameters.set("from", filters.dateFrom);
  if (filters.dateTo) parameters.set("to", filters.dateTo);
  if (page > 1) parameters.set("page", String(page));
  return `/search?${parameters.toString()}`;
}

function getCategoryHref(filters: SearchFilters, categoryId: string) {
  const parameters = new URLSearchParams();
  if (filters.query) parameters.set("q", filters.query);
  parameters.set("category", categoryId);
  if (filters.mediaType !== "all") parameters.set("media", filters.mediaType);
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
  const requestedMedia = url.searchParams.get("media") ?? "all";
  const mediaType = SEARCH_MEDIA_TYPES.includes(
    requestedMedia as (typeof SEARCH_MEDIA_TYPES)[number],
  )
    ? (requestedMedia as SearchFilters["mediaType"])
    : "all";
  const filters: SearchFilters = {
    query,
    categoryId,
    mediaType,
    dateFrom: readDate(url.searchParams.get("from")),
    dateTo: readDate(url.searchParams.get("to")),
  };
  const requestedPage = Number(url.searchParams.get("page"));
  const page = Number.isInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, 1_000)
    : 1;
  const hasCriteria = Boolean(
    query || categoryId || mediaType !== "all" || filters.dateFrom || filters.dateTo,
  );

  const [categories, user, categoryGroups, searchPage] = await Promise.all([
    listActiveCategories(env.DB),
    getOptionalTelegramUser(request),
    hasCriteria && !categoryId
      ? searchMaterialGroups(env.DB, filters)
      : Promise.resolve([]),
    hasCriteria && categoryId
      ? searchMaterials(env.DB, filters, page)
      : Promise.resolve({ materials: [], total: 0 }),
  ]);
  const savedMaterialIds = user && categoryId
    ? await listSavedMaterialIds(env.DB, user.id)
    : [];
  const total = categoryId
    ? searchPage.total
    : categoryGroups.reduce((sum, group) => sum + group.materialCount, 0);

  return {
    categories,
    categoryGroups,
    filters,
    hasCriteria,
    materials: searchPage.materials,
    total,
    page,
    savedMaterialIds,
    canSave: Boolean(user),
  };
}

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
        <li key={group.id}>
          <Link to={getCategoryHref(filters, group.id)}>
            <span className="search-category-icon" aria-hidden="true">
              <CategoryIcon categoryId={group.id} size={22} strokeWidth={1.8} />
            </span>
            <span>
              <strong>{group.name}</strong>
              <small>{group.materialCount} արդյունք</small>
            </span>
            <span className="search-category-count">{group.materialCount}</span>
            <ArrowRight aria-hidden="true" size={18} strokeWidth={1.9} />
          </Link>
        </li>
      ))}
    </ol>
  );
});

const SearchForm = memo(function SearchForm({
  categories,
  filters,
}: {
  categories: Route.ComponentProps["loaderData"]["categories"];
  filters: SearchFilters;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSearching = navigation.location?.pathname === "/search";

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const submitForm = useCallback(() => {
    if (!formRef.current) return;
    void submit(formRef.current, { preventScrollReset: true, replace: true });
  }, [submit]);

  const handleQueryInput = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(submitForm, 1_000);
  }, [submitForm]);

  const handleImmediateChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    submitForm();
  }, [submitForm]);

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!event.currentTarget.checkValidity()) event.preventDefault();
  }, []);

  return (
    <Form
      ref={formRef}
      className="search-panel"
      method="get"
      role="search"
      onSubmit={handleSubmit}
    >
      <div className="search-primary-field">
        <SearchIcon aria-hidden="true" size={20} strokeWidth={1.9} />
        <input
          type="search"
          name="q"
          defaultValue={filters.query}
          placeholder="Օրինակ՝ առակ, Սուրբ Մարիամ, աղոթք…"
          aria-label="Որոնման բառեր"
          autoComplete="off"
          onInput={handleQueryInput}
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
            filters.mediaType !== "all" ||
            filters.dateFrom ||
            filters.dateTo
        )}
      >
        <summary>
          <Filter aria-hidden="true" size={17} strokeWidth={1.9} />
          Զտել արդյունքները
        </summary>
        <div className="search-filter-grid">
          <label>
            <span>Բաժին</span>
            <select
              name="category"
              defaultValue={filters.categoryId}
              onChange={handleImmediateChange}
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
            <span>Տեսակ</span>
            <select
              name="media"
              defaultValue={filters.mediaType}
              onChange={handleImmediateChange}
            >
              {SEARCH_MEDIA_TYPES.map((mediaType) => (
                <option key={mediaType} value={mediaType}>
                  {mediaLabels[mediaType]}
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
              onChange={handleImmediateChange}
            />
          </label>
          <label>
            <span>Մինչև</span>
            <input
              type="date"
              name="to"
              defaultValue={filters.dateTo}
              onChange={handleImmediateChange}
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
  materials,
  savedMaterialIds,
}: {
  canSave: boolean;
  materials: SearchMaterial[];
  savedMaterialIds: string[];
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
          canSave={canSave}
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

  return (
    <main className="search-page">
      <SiteNav actionHref="/" actionLabel="← Գրադարան" />
      <header className="search-header">
        <p className="library-kicker">Ամբողջ գրադարանը</p>
        <h1>Որոնում</h1>
        <p>Փնտրիր վերնագրերի և Telegram-ից ներմուծված ամբողջ տեքստի մեջ։</p>
      </header>

      <SearchForm categories={categories} filters={filters} />

      <section className="search-results" aria-live="polite">
        {hasCriteria ? (
          <div className="section-heading search-results-heading">
            <h2>{selectedCategory?.name ?? "Համապատասխան բաժիններ"}</h2>
            <span>{total}</span>
          </div>
        ) : null}

        {!hasCriteria ? (
          <div className="search-empty-state">
            <SearchIcon aria-hidden="true" size={26} strokeWidth={1.6} />
            <h2>Գրիր այն, ինչ փնտրում ես</h2>
            <p>Կարող ես որոնել նաև միայն բաժնով, ամսաթվով կամ նյութի տեսակով։</p>
          </div>
        ) : categoryGroups.length === 0 && materials.length === 0 ? (
          <div className="search-empty-state">
            <SearchIcon aria-hidden="true" size={26} strokeWidth={1.6} />
            <h2>Համապատասխան նյութ չգտնվեց</h2>
            <p>Փորձիր ավելի կարճ բառ կամ հանիր զտիչներից մեկը։</p>
          </div>
        ) : !filters.categoryId ? (
          <SearchCategoryGroups filters={filters} groups={categoryGroups} />
        ) : (
          <SearchResults
            canSave={loaderData.canSave}
            materials={materials}
            savedMaterialIds={loaderData.savedMaterialIds}
          />
        )}
        {hasCriteria && filters.categoryId && totalPages > 1 ? (
          <nav className="search-pagination" aria-label="Որոնման էջեր">
            {page > 1 ? <Link to={getPageHref(filters, page - 1)}>← Նախորդ</Link> : <span />}
            <span>{page} / {totalPages}</span>
            {page < totalPages ? <Link to={getPageHref(filters, page + 1)}>Հաջորդ →</Link> : <span />}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
