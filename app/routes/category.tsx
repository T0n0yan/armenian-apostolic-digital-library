import { searchValidation } from "../utils/search-validation";
import { env } from "cloudflare:workers";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Link, redirect, useNavigation } from "react-router";

import type { Route } from "./+types/category";
import { getOptionalTelegramUser, getTelegramUserCacheScope } from "../auth/telegram-user.server";
import { MaterialResultCard } from "../components/material-result-card";
import { cardVariantFor } from "../utils/card-variant";
import { quizResults, type QuizResult } from "../data/poll-votes.server";
import { InfiniteLoadControls } from "../components/infinite-load-controls";
import { preloadArt } from "../components/art-image";
import { EmptyState, PageShell } from "../components/page-layout";
import { MaterialListSkeleton } from "../components/material-skeleton";
import {
  getCategoryImage,
  SectionHeader,
} from "../components/section-header";
import { SiteNav } from "../components/site-nav";
import { countBadge, sectionHeader, sectionTitle } from "../components/ui-styles";
import { getActiveCategoryBySlug, listActiveCategories } from "../data/categories.server";
import { getPublicMaterialDetail } from "../data/material-detail.server";
import { canonicalMaterialPath } from "../data/material-page.server";
import { OLD_SECTION_SLUGS, categoryForSection, materialIdFromShortPath, materialPath, sectionPath } from "../utils/material-path";
import { DailyReadingCard, PsalmGrid, SaintGrid, SectionIntro, TopicIntro } from "../components/category-cards";
import { psalmNumber } from "../utils/psalm-number";
import { MORE_GROUP, PRAYER_GROUPS, prayerGroupOf, type PrayerGroupId } from "../utils/prayer-groups";
import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";
import type { PublicMaterial } from "../data/materials.server";
import { getTopicIntro, listPublicMaterialPageByCategory } from "../data/materials.server";
import { listSavedMaterialIds } from "../data/saved-materials.server";
import type { SearchFilters, SearchMaterial } from "../data/search-materials";
import { SearchSnippet } from "../components/material-result-card";
import { searchMaterials } from "../data/search-materials.server";
import { resolveSearchQuery } from "../data/search-query.server";
import { useSavedMaterials } from "../hooks/use-saved-materials";
import { loadNavigationData, writeNavigationCache } from "../utils/navigation-cache";
import { NOINDEX, SITE_NAME, breadcrumbJsonLd, sectionImage, seoMeta } from "../utils/seo";
import { RouteErrorPage } from "../components/error-page";

type CategoryMaterial = PublicMaterial | SearchMaterial;
type CategoryLayout = "default" | "psalm-grid" | "portrait" | "text" | "video" | "calendar";

/** Each content category browses in its own layout; search results always use the standard cards. */
function categoryLayout(category: { id: string; name: string }): CategoryLayout {
  switch (resolveContentCategoryId(category.id, category.name)) {
    case "category_psalms": return "psalm-grid";
    case "category_saints_lives": return "portrait";
    case "category_prayers":
    case "category_bible_questions": return "text";
    case "category_gospel_teachings": return "video";
    case "category_daily_readings": return "calendar";
    default: return "default";
  }
}

const CATEGORY_SEARCH_PLACEHOLDERS: Record<string, string> = {
  category_saints_lives: "Փնտրել սրբի անունով…",
  category_gospel_teachings: "Փնտրել թեմա կամ հատված…",
  category_psalms: "Փնտրել սաղմոսի համարով կամ բառով…",
  category_bible_questions: "Փնտրել հարց կամ թեմա…",
  category_prayers: "Փնտրել աղոթք…",
  category_daily_readings: "Փնտրել ընթերցանություն…",
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  category_saints_lives: "Սրբերի վարքը՝ հավատքի և ծառայության օրինակներ։",
  category_gospel_teachings: "Ավետարանի բացատրություններ Եկեղեցու հոգևորականներից։",
  category_psalms: "Սաղմոսները՝ ըստ համարի և բովանդակության։",
  category_bible_questions: "Հարցեր և բացատրություններ Աստվածաշնչի շուրջ։",
  category_prayers: "Աղոթքներ՝ առօրյա, տոնական և անձնական ընթերցման համար։",
  category_daily_readings: "Օրվա ընթերցումները, տոներն ու հիշատակությունները։",
};

/** Sections whose introduction the site writes itself, in place of the Telegram topic's intro post. */
const SECTION_INTROS: Record<string, { title: string; body: string }> = {
  category_saints_lives: {
    title: "Սրբերի վարքը",
    body: "Այստեղ կծանոթանաք Հայ Առաքելական Սուրբ Եկեղեցու կողմից հիշատակվող սրբերի վարքին՝ Հին Ուխտի արդարներից ու մարգարեներից մինչև Եկեղեցու հայրեր, վարդապետներ և նահատակներ։ Նրանց կյանքը հավատքի, համբերության և սիրո օրինակ է մեզ համար։",
  },
  category_gospel_teachings: {
    title: "Ավետարանի ուսուցում",
    body: "Այստեղ կծանոթանաք Սուրբ Ավետարանի բացատրություններին, որոնք տալիս են Հայ Առաքելական Սուրբ Եկեղեցու հոգևորականները։ Դրանք օգնում են ավելի խորը հասկանալ Քրիստոսի խոսքը և ապրել նրանով առօրյա կյանքում։",
  },
  category_daily_readings: {
    title: "Օրվա ընթերցումներ",
    body: "Ամեն օր՝ Հայ Առաքելական Սուրբ Եկեղեցու տոնացույցով նշանակված Սուրբ Գրքի ընթերցումները, օրվա տոներն ու հիշատակությունները։ Սկսեք օրը Աստծո խոսքով։",
  },
};

export function meta({ loaderData }: Route.MetaArgs) {
  // Without data the error boundary renders its own title and noindex.
  if (!loaderData) return [];
  const { category, query } = loaderData;
  const kind = resolveContentCategoryId(category.id, category.name) ?? "";
  const path = sectionPath(category);
  // A section's search results are not pages of their own.
  if (query) return [{ title: `${category.name} · «${query}» — Հոգևոր ժառանգություն` }, ...NOINDEX];
  return seoMeta({
    title: `${category.name} — Հայ Առաքելական Եկեղեցի | Հոգևոր ժառանգություն`,
    description: `${CATEGORY_DESCRIPTIONS[kind] ?? `${category.name}՝ Հայ Առաքելական Սուրբ Եկեղեցու հոգևոր գրադարանում։`} Հայ Առաքելական Սուրբ Եկեղեցու հոգևոր գրադարան։`,
    path,
    origin: loaderData.origin,
    image: `${loaderData.origin}${sectionImage(category.id, category.name) ?? "/og-image.png?v=2"}`,
    jsonLd: [breadcrumbJsonLd([{ name: SITE_NAME, path: "/" }, { name: category.name, path }])],
  });
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "")
    .trim()
    .slice(0, 120);
  if (url.searchParams.has("q") && searchValidation(query, true)) throw new Response(searchValidation(query, true) ?? "", { status: 400 });
  const cursor = (url.searchParams.get("cursor") ?? "").slice(0, 2_000) || null;
  const search = (() => { const kept = new URLSearchParams(url.search); kept.delete("_routes"); const value = kept.toString(); return value ? `?${value}` : ""; })();
  let slug = params.slug;
  if (!slug) {
    const segment = params.section ?? "";
    // An old short address (/pray_364) moves permanently to the material's readable one.
    const oldMaterial = materialIdFromShortPath(segment);
    if (oldMaterial) {
      const material = await getPublicMaterialDetail(env.DB, oldMaterial, request.signal);
      if (!material) throw new Response("Not Found", { status: 404 });
      throw redirect(`${canonicalMaterialPath(material)}${search}`, 301);
    }
    // An earlier Armenian section address (/saghmosner) moves to the English one (/psalms).
    if (OLD_SECTION_SLUGS[segment]) throw redirect(`/${OLD_SECTION_SLUGS[segment]}${search}`, 301);
    const contentCategory = categoryForSection(segment);
    const topic = contentCategory
      ? (await listActiveCategories(env.DB, false, request.signal)).find((item) => resolveContentCategoryId(item.id, item.name) === contentCategory)
      : null;
    if (!topic) throw new Response("Not Found", { status: 404, statusText: "Not Found" });
    slug = topic.slug;
  }
  const [category, user] = await Promise.all([
    getActiveCategoryBySlug(env.DB, slug, request.signal),
    getOptionalTelegramUser(request),
  ]);

  if (!category) {
    throw new Response("Category not found", {
      status: 404,
      statusText: "Not Found",
    });
  }
  if (query && searchValidation(query, resolveContentCategoryId(category.id, category.name) === "category_psalms")) throw new Response(searchValidation(query, true) ?? "", { status: 400 });
  // /categories/<topic> of a known section moves permanently to its readable address (/psalms).
  const canonical = sectionPath(category);
  if (url.pathname.replace(/\.data$/u, "") !== canonical) throw redirect(`${canonical}${search}`, 301);

  const resolvedQuery = query ? await resolveSearchQuery(env.DB, query) : null;
  const filters: SearchFilters = {
    query,
    categoryId: category.id,
    scope: "library",
    dateFrom: "",
    dateTo: "",
  };
  const isQuestions = resolveContentCategoryId(category.id, category.name) === "category_bible_questions";
  const [materialResult, savedMaterialIds, quizAnswers] = await Promise.all([
    query && resolvedQuery
      ? searchMaterials(env.DB, filters, cursor, 20, resolvedQuery, request.signal)
      : listPublicMaterialPageByCategory(env.DB, category.id, category.defaultSort, cursor, request.signal),
    user ? listSavedMaterialIds(env.DB, user.id) : Promise.resolve([]),
    // Which questions the reader already answered, and how.
    user && isQuestions ? quizResults(env.DB, user.id, category.id).catch(() => ({})) : Promise.resolve({}),
  ]);
  // Grid and question topics show their introduction post as a header (it is their oldest post,
  // so on paged feeds it would otherwise only appear at the very end).
  const layout = categoryLayout(category);
  const intro = !query && (layout === "psalm-grid" || layout === "portrait" || layout === "text")
    ? await getTopicIntro(env.DB, category.id).catch(() => null)
    : null;
  const materials = intro ? materialResult.materials.filter((material) => material.id !== intro.id) : materialResult.materials;

  return {
    origin: url.origin,
    category,
    intro,
    materials,
    query,
    // The intro is shown as the header, not counted as a material.
    total: intro && typeof materialResult.total === "number" ? Math.max(0, materialResult.total - 1) : materialResult.total,
    nextCursor: materialResult.nextCursor,
    highlightQuery: resolvedQuery?.highlightQuery ?? "",
    savedMaterialIds,
    quizAnswers: quizAnswers as Record<string, QuizResult>,
    canSave: Boolean(user),
    navigationCacheKey: `${url.pathname}${url.search}`,
    navigationCacheScope: await getTelegramUserCacheScope(user),
  };
}

type CategoryLoaderData = Awaited<ReturnType<typeof loader>>;

let hydrated = false;

export async function clientLoader({ request, serverLoader }: Route.ClientLoaderArgs) {
  const data = await loadNavigationData("topic-feed", request.url, async () => await serverLoader() as CategoryLoaderData);
  // On navigation, wait (briefly) for the section's picture so the page shows all at once.
  if (hydrated) await preloadArt(getCategoryImage(data.category.id, data.category.name));
  hydrated = true;
  return data;
}
clientLoader.hydrate = true as const;

const MaterialsList = memo(function MaterialsList({
  canSave,
  layout,
  materials,
  savedMaterialIds,
  highlightQuery,
  quizAnswers = {},
  category,
}: {
  canSave: boolean;
  /** The section, for the materials' short addresses (/pray_364). */
  category?: string;
  layout: CategoryLayout;
  materials: CategoryMaterial[];
  savedMaterialIds: string[];
  highlightQuery?: string;
  quizAnswers?: Record<string, QuizResult>;
}) {
  const { isSaving, pendingMaterialId, savedIds, setSaved } =
    useSavedMaterials(savedMaterialIds);
  const handleSavedChange = useCallback(
    (materialId: string, saved: boolean, personalNote = "") =>
      setSaved(materialId, saved, personalNote),
    [setSaved],
  );

  // Posts that don't fit the grid (a topic's intro, a psalm without a number, a saint without a
  // picture) are listed as text cards above it instead of as broken tiles.
  const isGridItem = layout === "psalm-grid"
    ? (material: CategoryMaterial) => psalmNumber(material) !== null
    : layout === "portrait"
      ? (material: CategoryMaterial) => Boolean(material.preview.imageUrl ?? material.preview.thumbnailUrl)
      : null;
  const gridItems = isGridItem ? materials.filter(isGridItem) : [];
  const listItems = isGridItem ? materials.filter((material) => !isGridItem(material)) : materials;
  const listVariant = isGridItem ? "text" : layout === "text" || layout === "video" ? layout : "default";
  const polls = materials.filter((material) => material.contentType === "poll").length;
  const typicalType = layout === "text" && polls > 0 && polls >= materials.length / 2 ? "poll" : undefined;

  const list = listItems.length > 0 ? (
    <ol className={`m-0 grid list-none gap-2.5 p-0 min-[860px]:grid-cols-2 min-[860px]:auto-rows-fr`}>
      {listItems.map((material) =>
          <MaterialResultCard
            key={material.id}
            material={material}
            variant={layout === "default" && "categoryName" in material ? cardVariantFor(material) : listVariant}
            typicalType={layout === "default" ? "poll" : typicalType}
            quizResult={quizAnswers[material.id]}
            category={category}
            highlightQuery={highlightQuery}
            canSave={canSave}
            isSaved={savedIds.has(material.id)}
            isSaving={isSaving && pendingMaterialId === material.id}
            onSavedChange={handleSavedChange}
          />
      )}
    </ol>
  ) : null;

  if (layout === "calendar") {
    return (
      <ol className="m-0 grid list-none gap-3 p-0 min-[860px]:grid-cols-2">
        {materials.map((material) => <DailyReadingCard key={material.id} material={material} />)}
      </ol>
    );
  }
  if (!isGridItem) return list;
  return (
    <div className="grid gap-3">
      {listItems.length > 0 ? list : null}
      {gridItems.length > 0 ? layout === "psalm-grid" ? <PsalmGrid materials={gridItems} /> : <SaintGrid materials={gridItems} /> : null}
    </div>
  );
});

const chip = "inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-semibold transition-colors";

/** A row of filter chips with counts; scrolls sideways on narrow screens. */
function FilterChips<T extends string>({ options, value, onChange, label }: { options: Array<{ id: T; label: string; count: number }>; value: T; onChange: (value: T) => void; label: string }) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.id} type="button" role="radio" aria-checked={value === option.id} onClick={() => onChange(option.id)}
          className={`${chip} ${value === option.id ? "border-[rgb(217_181_111/60%)] bg-[rgb(217_181_111/18%)] text-gold-bright" : "border-glass-border bg-subtle text-muted hover:text-ink"}`}>
          {option.label}<span className="text-[11px] opacity-70 tabular-nums">{option.count}</span>
        </button>
      ))}
    </div>
  );
}

type ListProps = Parameters<typeof MaterialsList>[0];

/**
 * Prayers in groups (morning, evening, hours, for loved ones…) with chips to pick one, and Bible
 * questions with an answered / not answered filter. Other sections list as they are.
 */
function GroupedMaterials({ kind, ...props }: ListProps & { kind: string | null }) {
  const [prayerGroup, setPrayerGroup] = useState<PrayerGroupId | "all">("all");
  const [quizFilter, setQuizFilter] = useState<"all" | "open" | "answered">("all");

  if (kind === "category_prayers") {
    const groups = [...PRAYER_GROUPS, MORE_GROUP].map((group) => ({ ...group, items: props.materials.filter((material) => prayerGroupOf(material) === group.id) })).filter((group) => group.items.length > 0);
    if (groups.length < 2) return <div className="prayer-cards"><MaterialsList {...props} /></div>;
    const shown = prayerGroup === "all" ? groups : groups.filter((group) => group.id === prayerGroup);
    return (
      <div className="prayer-cards grid gap-4">
        <FilterChips label="Աղոթքների խմբեր" value={prayerGroup} onChange={setPrayerGroup}
          options={[{ id: "all" as const, label: "Բոլորը", count: props.materials.length }, ...groups.map((group) => ({ id: group.id, label: group.label, count: group.items.length }))]} />
        {shown.map((group) => (
          <section key={group.id} className="grid gap-2.5" aria-label={group.label}>
            {prayerGroup === "all" ? (
              <h3 className="m-0 flex items-baseline gap-2 px-1 text-[15px] font-semibold text-ink">
                {group.label}<span className="text-[11.5px] font-medium text-faint">{group.items.length}</span>
              </h3>
            ) : group.hint ? <p className="m-0 px-1 text-[12.5px] text-muted">{group.hint}</p> : null}
            <MaterialsList {...props} materials={group.items} />
          </section>
        ))}
      </div>
    );
  }

  if (kind === "category_bible_questions" && props.canSave) {
    const answers = props.quizAnswers ?? {};
    const answered = props.materials.filter((material) => answers[material.id]);
    const open = props.materials.filter((material) => !answers[material.id]);
    const shown = quizFilter === "answered" ? answered : quizFilter === "open" ? open : props.materials;
    return (
      <div className="grid gap-3">
        <QuizProgress total={props.materials.length} answers={answered.map((material) => answers[material.id])} />
        <FilterChips label="Հարցերի զտիչ" value={quizFilter} onChange={setQuizFilter}
          options={[{ id: "all" as const, label: "Բոլորը", count: props.materials.length }, { id: "open" as const, label: "Չպատասխանած", count: open.length }, { id: "answered" as const, label: "Պատասխանած", count: answered.length }]} />
        {shown.length ? <MaterialsList {...props} materials={shown} /> : (
          <p className="m-0 rounded-[14px] bg-subtle px-4 py-5 text-center text-[13px] text-muted">{quizFilter === "answered" ? "Դեռ ոչ մի հարցի չեք պատասխանել։" : "Բոլոր հարցերին պատասխանել եք։ 🎉"}</p>
        )}
      </div>
    );
  }

  return <MaterialsList {...props} />;
}

/** How far the reader has come through the Bible questions: a bar with answered and right counts. */
function QuizProgress({ total, answers }: { total: number; answers: QuizResult[] }) {
  if (total === 0) return null;
  const right = answers.filter((answer) => answer === "right").length;
  const share = Math.round((answers.length / total) * 100);
  return (
    <div className="frosted-panel grid gap-2.5 px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <strong className="text-[13.5px] text-ink">{answers.length === 0 ? "Փորձեք ձեր գիտելիքները" : answers.length === total ? "Բոլոր հարցերին պատասխանել եք" : `Պատասխանել եք ${answers.length} հարցի՝ ${total}-ից`}</strong>
        {answers.length > 0 ? <span className="text-[12px] font-bold text-[rgb(52_130_74)]">✓ ճիշտ՝ {right}</span> : <span className="text-[12px] text-muted">{total} հարց</span>}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answers.length} aria-label="Պատասխանած հարցեր">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#e2c27e,#b07d2e)] transition-[width] duration-700" style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

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
  const contentCategory = resolveContentCategoryId(category.id, category.name) ?? category.id;
  const searchPlaceholder = CATEGORY_SEARCH_PLACEHOLDERS[contentCategory] ??
    "Փնտրել այս թեմայում…";
  const navigation = useNavigation();
  const isRefreshing = navigation.state === "loading" &&
    navigation.location?.pathname === sectionPath(category);
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
          for (const material of data.materials) if (material.id !== loaderData.intro?.id) byId.set(material.id, material);
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

  // Searching inside a section finds among the section's own items: the page scrolls to the first
  // match and lights it up (psalms by their number on the phone, words through the library's search),
  // and only when nothing here matches offers the whole library.
  type Hit = { id: string; title: string; excerpt?: string | null; searchHit?: SearchMaterial["searchHit"] };
  const [found, setFound] = useState<{ query: string; ids: string[]; hits: Record<string, Hit>; index: number } | null>(null);
  const [finding, setFinding] = useState(false);
  const isPsalms = contentCategory === "category_psalms";
  const hrefOf = useCallback((material: CategoryMaterial) =>
    materialPath(material.id, contentCategory, { psalm: isPsalms ? psalmNumber(material) : null, title: material.title }), [contentCategory, isPsalms]);
  const findInSection = useCallback(async (query: string) => {
    if (!query) { setFound(null); return; }
    setFinding(true);
    // Every item of the section on the page first (sections are a few dozen to a few hundred posts).
    let pool = materials;
    let cursor = nextCursor;
    for (let page = 0; cursor && page < 25; page += 1) {
      const response = await fetch(`/api/categories/${category.slug}/posts?cursor=${encodeURIComponent(cursor)}`).catch(() => null);
      if (!response?.ok) break;
      const data = await response.json() as { materials: CategoryMaterial[]; nextCursor: string | null };
      const byId = new Map(pool.map((material) => [material.id, material]));
      for (const material of data.materials) if (material.id !== loaderData.intro?.id) byId.set(material.id, material);
      pool = [...byId.values()];
      cursor = data.nextCursor;
    }
    if (pool !== materials) { setMaterials(pool); setNextCursor(cursor); }
    let ids: string[] = [];
    const hits: Record<string, Hit> = {};
    if (isPsalms && /^\d{1,3}$/u.test(query)) {
      ids = pool.filter((material) => psalmNumber(material) === Number(query)).map((material) => material.id);
    } else {
      const response = await fetch(`/api/search-page?category=${encodeURIComponent(category.id)}&q=${encodeURIComponent(query)}`).catch(() => null);
      const data = response?.ok ? await response.json() as { materials: Hit[] } : { materials: [] };
      const here = new Set(pool.map((material) => material.id));
      for (const material of data.materials) if (here.has(material.id)) { ids.push(material.id); hits[material.id] = material; }
    }
    setFound({ query, ids, hits, index: 0 });
    setFinding(false);
  }, [category.id, category.slug, isPsalms, loaderData.intro?.id, materials, nextCursor]);

  // Another section starts clean: no earlier search in its field, nothing found yet.
  useEffect(() => { setFound(null); setFinding(false); }, [category.id]);

  // A link from elsewhere (/psalms?find=5) finds on arrival.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("find");
    if (wanted && !searchValidation(wanted, isPsalms)) void findInSection(wanted);
    // Once per arrival on the section.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id]);

  // Light up the matches and bring the current one to the middle of the screen.
  useEffect(() => {
    const list = document.querySelector('[aria-labelledby="category-materials-title"]');
    list?.querySelectorAll("[data-found]").forEach((element) => element.removeAttribute("data-found"));
    if (!found?.ids.length) return;
    const wanted = new Set(found.ids.map((id) => materials.find((material) => material.id === id)).filter(Boolean).map((material) => hrefOf(material as CategoryMaterial)));
    const links = [...(list?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [])].filter((link) => wanted.has(new URL(link.href).pathname));
    links.forEach((link) => link.setAttribute("data-found", "true"));
    const currentId = found.ids[found.index % found.ids.length];
    const currentMaterial = materials.find((material) => material.id === currentId);
    const current = links.find((link) => currentMaterial && new URL(link.href).pathname === hrefOf(currentMaterial)) ?? links[0];
    if (!current) return;
    current.setAttribute("data-found", "current");
    current.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    current.focus({ preventScroll: true });
  }, [found, hrefOf, materials]);

  return (
    <PageShell>
      <SiteNav />
      <SectionHeader
        key={category.id}
        backTo="/"
        backLabel="Բաժիններ"
        imageSrc={getCategoryImage(category.id, category.name)}
        title={category.name}
        query={loaderData.query}
        searchAction={sectionPath(category)}
        searchCategoryId={category.id}
        searchLabel={`${category.name} բաժնում որոնում`}
        searchPlaceholder={searchPlaceholder}
        onSearch={(query) => void findInSection(query)}
      />

      {finding || found ? (() => {
        const count = found?.ids.length ?? 0;
        const position = count ? (found!.index % count + count) % count : 0;
        const currentId = count ? found!.ids[position] : null;
        const current = currentId ? materials.find((material) => material.id === currentId) : null;
        const hit = currentId ? found?.hits[currentId] : null;
        const step = (delta: number) => found && setFound({ ...found, index: found.index + delta });
        const label = current ? (isPsalms && psalmNumber(current) ? `Սաղմոս ${psalmNumber(current)}` : current.title) : "";
        // Floats at the bottom of the screen, so the matches stay one tap away however far the page scrolls.
        return (
          <div className="fixed inset-x-3 bottom-[calc(var(--tg-inset-bottom,0px)+86px)] z-40 mx-auto grid max-w-[560px] gap-1.5 rounded-[18px] border border-[rgb(217_181_111/40%)] bg-[var(--page-bg)] p-3 text-[13px] shadow-[0_18px_44px_rgb(20_10_5/40%)]" role="status" aria-live="polite">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-bold text-ink">
                {finding ? "Փնտրում եմ այս բաժնում…" : count ? `«${found!.query}»՝ ${position + 1} / ${count}` : `«${found?.query}» այս բաժնում չգտնվեց`}
              </span>
              {!finding && count > 1 ? (
                <>
                  <button type="button" className="grid size-9 cursor-pointer place-items-center rounded-[10px] border border-glass-border bg-transparent text-gold-bright" onClick={() => step(-1)} aria-label="Նախորդը"><ChevronUp aria-hidden="true" size={18} /></button>
                  <button type="button" className="grid size-9 cursor-pointer place-items-center rounded-[10px] border border-glass-border bg-transparent text-gold-bright" onClick={() => step(1)} aria-label="Հաջորդը"><ChevronDown aria-hidden="true" size={18} /></button>
                </>
              ) : null}
              {!finding ? <button type="button" className="grid size-9 cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent text-muted" onClick={() => setFound(null)} aria-label="Փակել որոնումը"><X aria-hidden="true" size={18} /></button> : null}
            </div>
            {!finding && current ? (
              // What was found: the item and the words in their sentence.
              <p className="m-0 line-clamp-3 text-[12.5px] leading-[1.5] text-muted">
                <strong className="text-gold-bright">{label}</strong>
                {hit?.searchHit || hit?.excerpt ? <>{" — "}<SearchSnippet hit={hit.searchHit} excerpt={hit.excerpt?.replace(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*`, "u"), "")} /></> : null}
              </p>
            ) : null}
            {!finding && found && !count ? (
              <Link className="inline-flex min-h-9 w-fit items-center rounded-[10px] bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] px-3 font-bold text-[#2a1708] no-underline" to={`/search?q=${encodeURIComponent(found.query)}`}>Որոնել ամբողջ կայքում</Link>
            ) : null}
          </div>
        );
      })() : null}

      {loaderData.query ? null : SECTION_INTROS[contentCategory]
        ? <div className="mb-4"><SectionIntro {...SECTION_INTROS[contentCategory]} /></div>
        : loaderData.intro ? <div className="mb-4"><TopicIntro material={loaderData.intro} /></div> : null}

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
              <p>Այս բաժնում չգտնվեց։ Որոնե՞լ ամբողջ կայքում։</p>
              <span className="mt-[9px] flex flex-wrap gap-2">
                <Link
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-[12px] bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] px-4 text-[12.5px] font-bold text-[#2a1708] no-underline"
                  to={`/search?q=${encodeURIComponent(loaderData.query)}`}
                >
                  Որոնել ամբողջ կայքում
                </Link>
                <Link
                  className="inline-flex min-h-10 items-center rounded-[12px] border border-glass-border px-4 text-[12.5px] font-bold text-gold-bright no-underline"
                  to={sectionPath(category)}
                >
                  Ցույց տալ բաժնի բոլոր նյութերը
                </Link>
              </span>
            </EmptyState>
          ) : (
            <EmptyState><p>Այս բաժնում դեռ հրապարակված նյութ չկա։</p></EmptyState>
          )
        ) : (
          <GroupedMaterials
            kind={loaderData.query ? null : resolveContentCategoryId(category.id, category.name)}
            canSave={loaderData.canSave}
            layout={loaderData.query ? "default" : categoryLayout(category)}
            materials={materials}
            savedMaterialIds={loaderData.savedMaterialIds}
            highlightQuery={loaderData.highlightQuery}
            quizAnswers={loaderData.quizAnswers}
            category={category.name}
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
  return <RouteErrorPage error={error} notFoundTitle="Բաժինը չի գտնվել" />;
}
