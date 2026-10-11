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
      className="grid min-w-0 gap-3 rounded-[22px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] p-3 shadow-glass"
      method="get"
      role="search"
      onSubmit={handleSubmit}
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
          onInput={scheduleSubmit}
        />
        <button className="m-[5px] min-h-10 self-stretch rounded-xl border border-[rgb(240_211_151/24%)] bg-[linear-gradient(135deg,#7b4a8e,#5c326d)] px-4 font-[750] text-[#fffaf3]" type="submit" aria-label="Որոնել">
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
        <summary className="flex min-h-[46px] cursor-pointer list-none items-center gap-2 px-3.5 text-[0.78rem] font-[720] text-muted">
          <Filter aria-hidden="true" size={17} strokeWidth={1.9} />
          Զտել արդյունքները
          <ChevronDown
            className="ml-auto transition-transform duration-[180ms] group-open:rotate-180"
            aria-hidden="true"
            size={18}
          />
        </summary>
        <div className="grid gap-2.5 px-3 pt-1 pb-3 min-[560px]:grid-cols-2 min-[960px]:grid-cols-[1.4fr_1fr_1fr]">
          <label className="grid gap-1.5 text-[0.7rem] text-faint">
            <span>Բաժին</span>
            <select
              className="min-h-11 w-full rounded-xl border border-glass-border bg-control px-[11px] py-2 pr-[42px] text-ink shadow-[inset_0_1px_0_rgb(255_255_255/6%)] outline-none"
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
          <label className="grid gap-1.5 text-[0.7rem] text-faint">
            <span>Սկսած</span>
            <input
              className="min-h-11 w-full rounded-xl border border-glass-border bg-control px-[11px] py-2 text-ink shadow-[inset_0_1px_0_rgb(255_255_255/6%)] outline-none"
              type="date"
              name="from"
              defaultValue={filters.dateFrom}
              onChange={submitImmediately}
            />
          </label>
          <label className="grid gap-1.5 text-[0.7rem] text-faint">
            <span>Մինչև</span>
            <input
              className="min-h-11 w-full rounded-xl border border-glass-border bg-control px-[11px] py-2 text-ink shadow-[inset_0_1px_0_rgb(255_255_255/6%)] outline-none"
              type="date"
              name="to"
              defaultValue={filters.dateTo}
              onChange={submitImmediately}
            />
          </label>
        </div>
        <div className="flex items-center gap-3.5 px-3 pb-3">
          <Link className="inline-flex items-center gap-1.5 text-[0.76rem] font-[720] text-gold-bright no-underline" to="/search">
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
      <details className="group overflow-hidden rounded-[18px] border border-glass-border bg-[linear-gradient(145deg,rgb(255_255_255/8%),transparent_48%),var(--card-glass)] shadow-card transition-[border-color,background] duration-[160ms] hover:border-[rgb(217_181_111/32%)] open:border-[rgb(217_181_111/32%)]" onToggle={handleToggle}>
        <summary className="grid min-h-[74px] cursor-pointer list-none grid-cols-[42px_minmax(0,1fr)_auto_20px] items-center gap-[11px] px-3.5 py-3 text-inherit">
          <span className="grid size-[42px] place-items-center rounded-[14px] border border-[rgb(217_181_111/20%)] bg-[image:var(--icon-surface)] text-icon-ink" aria-hidden="true">
            {group.isPersonal ? (
              <Bookmark size={22} strokeWidth={1.8} />
            ) : (
              <CategoryIcon categoryId={group.id} size={22} strokeWidth={1.8} />
            )}
          </span>
          <span className="grid gap-[3px]">
            <strong className="text-[0.88rem]">{group.name}</strong>
            <small className="text-[0.68rem] text-faint">{group.materialCount} արդյունք</small>
          </span>
          <span className="grid h-8 min-w-8 place-items-center rounded-full border border-glass-border px-2 text-[0.72rem] text-gold-bright tabular-nums">{group.materialCount}</span>
          <ChevronDown
            className="text-gold transition-transform duration-[180ms] group-open:rotate-180"
            aria-hidden="true"
            size={18}
            strokeWidth={1.9}
          />
        </summary>
        <div className="border-t border-glass-border bg-subtle p-2.5">
          {fetcher.data ? (
            <SearchResults
              canSave={fetcher.data.canSave}
              allowNoteEditing={group.isPersonal}
              highlightQuery={fetcher.data.highlightQuery}
              materials={fetcher.data.materials}
              savedMaterialIds={fetcher.data.savedMaterialIds}
            />
          ) : (
            <span className="flex min-h-[68px] items-center justify-center gap-2 text-[0.76rem] text-muted" role="status">
              <LoaderCircle
                className="animate-search-spin"
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
    <ol className="m-0 grid list-none gap-2.5 p-0 [&>li]:animate-glass-enter">
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
    <main className="mx-auto min-h-svh w-[min(100%,940px)] pt-[calc(var(--tg-content-safe-area-inset-top,0px)+12px)] pr-[calc(var(--tg-content-safe-area-inset-right,0px)+clamp(14px,3vw,32px))] pb-[calc(var(--tg-content-safe-area-inset-bottom,0px)+clamp(44px,7vw,88px))] pl-[calc(var(--tg-content-safe-area-inset-left,0px)+clamp(14px,3vw,32px))] min-[560px]:pt-[calc(var(--tg-content-safe-area-inset-top,0px)+20px)] min-[1440px]:pt-[calc(var(--tg-content-safe-area-inset-top,0px)+26px)]">
      <SiteNav actionHref="/" actionLabel="← Գրադարան" />
      <header className="px-[clamp(2px,1vw,10px)] pt-[clamp(48px,8vw,92px)] pb-[clamp(28px,5vw,48px)] min-[1440px]:pt-[82px]">
        <p className="m-0 text-[clamp(0.7rem,1.3vw,0.78rem)] font-extrabold tracking-[0.1em] text-gold uppercase">Ամբողջ գրադարանը</p>
        <h1 className="mt-[13px] mb-0 max-w-[860px] text-[clamp(1.85rem,4.5vw,3.65rem)] leading-[1.06] font-[740] tracking-[-0.035em] text-balance">Որոնում</h1>
        <p className="mt-[18px] mb-0 max-w-[650px] text-[clamp(0.92rem,1.5vw,1.05rem)] leading-[1.65] text-muted">Փնտրիր վերնագրերի և Telegram-ից ներմուծված ամբողջ տեքստի մեջ։</p>
      </header>

      <SearchForm categories={categories} filters={filters} />

      {loaderData.correctedQuery ? (
        <p className="mx-1 mt-3 mb-0 text-[0.78rem] text-muted [&_strong]:text-gold-bright" role="status">
          Հասկացանք նաև՝ <strong>{loaderData.correctedQuery}</strong>
        </p>
      ) : null}

      <section className="mt-5 grid gap-3.5" aria-live="polite">
        {hasCriteria ? (
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 className="m-0 text-[clamp(1rem,2vw,1.2rem)]">{selectedTitle}</h2>
            <span className="grid min-h-[34px] min-w-[34px] place-items-center rounded-full border border-glass-border text-[0.8rem] text-muted tabular-nums">{total}</span>
          </div>
        ) : null}

        {!hasCriteria ? (
          <div className="grid justify-items-start gap-[9px] rounded-[22px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] p-[clamp(22px,5vw,38px)] text-muted shadow-glass [&_h2]:m-0 [&_h2]:text-base [&_h2]:text-ink [&_p]:m-0 [&_p]:text-[0.8rem] [&_p]:leading-[1.55]">
            <SearchIcon aria-hidden="true" size={26} strokeWidth={1.6} />
            <h2>Գրիր այն, ինչ փնտրում ես</h2>
            <p>Կարող ես որոնել նաև բաժնով, ամսաթվով կամ Telegram հղումով։</p>
          </div>
        ) : categoryGroups.length === 0 && materials.length === 0 ? (
          <div className="grid justify-items-start gap-[9px] rounded-[22px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] p-[clamp(22px,5vw,38px)] text-muted shadow-glass [&_h2]:m-0 [&_h2]:text-base [&_h2]:text-ink [&_p]:m-0 [&_p]:text-[0.8rem] [&_p]:leading-[1.55]">
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
          <nav className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 px-1 pt-3.5 text-[0.75rem] text-faint tabular-nums [&_a]:w-fit [&_a]:font-[720] [&_a]:text-gold-bright [&_a]:no-underline [&_a:last-of-type]:justify-self-end" aria-label="Որոնման էջեր">
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
