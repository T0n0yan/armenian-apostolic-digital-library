import { env } from "cloudflare:workers";
import { Bookmark, ChevronDown, Search, X } from "lucide-react";
import { memo, useCallback, useMemo } from "react";
import { Form, Link } from "react-router";

import type { Route } from "./+types/saved";
import {
  getOptionalTelegramUser,
  requireSameOriginUserRequest,
  requireTelegramUser,
  upsertAppUser,
} from "../auth/telegram-user.server";
import { CategoryIcon } from "../components/category-icon";
import { MaterialResultCard } from "../components/material-result-card";
import { SiteNav } from "../components/site-nav";
import {
  groupSavedMaterials,
  listSavedMaterials,
  setMaterialSaved,
  type SavedMaterialGroup,
} from "../data/saved-materials.server";
import { useSavedMaterials } from "../hooks/use-saved-materials";
import { useDebouncedFormSubmit } from "../hooks/use-debounced-form-submit";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Իմ անկյունը — Թվային գրադարան" },
    { name: "robots", content: "noindex, nofollow, noarchive" },
    { name: "theme-color", content: "#100817" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const query = (new URL(request.url).searchParams.get("q") ?? "")
    .trim()
    .slice(0, 120);
  const user = await getOptionalTelegramUser(request);
  if (!user) return { user: null, groups: [], query, total: 0 };
  await upsertAppUser(env.DB, user);
  const materials = await listSavedMaterials(env.DB, user.id, query);
  return {
    user,
    groups: groupSavedMaterials(materials),
    query,
    total: materials.length,
  };
}

export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const materialId = formData.get("materialId");
  const personalNote = formData.get("personalNote");
  if (
    (intent !== "save" && intent !== "remove") ||
    typeof materialId !== "string" ||
    !/^material_[a-zA-Z0-9_-]{1,100}$/.test(materialId) ||
    typeof personalNote !== "string" ||
    Array.from(personalNote).length > 160
  ) {
    return Response.json({ saved: false, error: "invalid-request" }, { status: 400 });
  }

  await upsertAppUser(env.DB, user);
  const saved = await setMaterialSaved(
    env.DB,
    user.id,
    materialId,
    intent === "save",
    personalNote,
  );
  return Response.json({ saved });
}

const SavedGroup = memo(function SavedGroup({ group, open }: {
  group: SavedMaterialGroup;
  open: boolean;
}) {
  const { materials } = group;
  const savedMaterialIds = useMemo(
    () => materials.map((material) => material.id),
    [materials],
  );
  const { isSaving, pendingMaterialId, savedIds, setSaved } =
    useSavedMaterials(savedMaterialIds);
  const handleSavedChange = useCallback(
    (materialId: string, saved: boolean, personalNote = "") =>
      setSaved(materialId, saved, personalNote),
    [setSaved],
  );

  return (
    <details className="saved-category-group" open={open}>
      <summary>
        <CategoryIcon categoryId={group.categoryId} size={20} strokeWidth={1.8} />
        <span>
          <strong>{group.categoryName}</strong>
          <small>{materials.length} պահված նյութ</small>
        </span>
        <span className="saved-category-count">{materials.length}</span>
        <ChevronDown className="saved-category-chevron" aria-hidden="true" size={18} />
      </summary>
      <ol className="materials-list saved-materials-list">
        {materials.map((material) => (
          <MaterialResultCard
            key={material.id}
            material={material}
            canSave
            isSaved={savedIds.has(material.id)}
            isSaving={isSaving && pendingMaterialId === material.id}
            allowNoteEditing
            onSavedChange={handleSavedChange}
          />
        ))}
      </ol>
    </details>
  );
});

const SavedSearch = memo(function SavedSearch({ query }: { query: string }) {
  const { cancelPending, formRef, scheduleSubmit } =
    useDebouncedFormSubmit(650);

  return (
    <Form
      ref={formRef}
      className="saved-search"
      role="search"
      method="get"
      onSubmit={cancelPending}
    >
      <Search aria-hidden="true" size={18} strokeWidth={1.9} />
      <input
        type="search"
        name="q"
        defaultValue={query}
        onInput={scheduleSubmit}
        placeholder="Փնտրել պահվածներում կամ իմ նշումներում…"
        aria-label="Փնտրել պահված նյութերում"
      />
      {query ? (
        <Link to="/saved" aria-label="Մաքրել որոնումը" title="Մաքրել">
          <X aria-hidden="true" size={17} />
        </Link>
      ) : null}
    </Form>
  );
});

export default function Saved({ loaderData }: Route.ComponentProps) {
  return (
    <main className="saved-page">
      <SiteNav actionHref="/" actionLabel="← Գրադարան" />
      <header className="saved-header">
        <p className="library-kicker">Անձնական տարածք</p>
        <h1>Իմ անկյունը</h1>
        <p>
          {loaderData.user
            ? `${loaderData.user.displayName}, այստեղ են քո պահած նյութերը։`
            : "Պահած նյութերը հասանելի են Telegram Mini App-ի ներսում։"}
        </p>
      </header>

      {!loaderData.user ? (
        <section className="saved-empty-state">
          <Bookmark aria-hidden="true" size={28} strokeWidth={1.6} />
          <h2>Բացիր գրադարանը Telegram-ից</h2>
          <p>Այդպես քո պահած նյութերը կապվում են հենց քո Telegram հաշվի հետ։</p>
        </section>
      ) : loaderData.total === 0 && !loaderData.query ? (
        <section className="saved-empty-state">
          <Bookmark aria-hidden="true" size={28} strokeWidth={1.6} />
          <h2>Դեռ ոչինչ չես պահել</h2>
          <p>Նյութի կողքի նշանը սեղմիր, և այն կհայտնվի այստեղ։</p>
          <Link className="saved-search-link" to="/search">
            <Search aria-hidden="true" size={17} /> Գտնել նյութ
          </Link>
        </section>
      ) : (
        <section className="saved-results" aria-labelledby="saved-title">
          <SavedSearch query={loaderData.query} />
          <div className="section-heading">
            <h2 id="saved-title">
              {loaderData.query ? "Գտնված նյութեր" : "Պահված նյութեր"}
            </h2>
            <span>{loaderData.total}</span>
          </div>
          {loaderData.groups.length === 0 ? (
            <div className="saved-no-results">
              <span className="saved-no-results-icon" aria-hidden="true">
                <Search size={22} strokeWidth={1.7} />
              </span>
              <div>
                <h2>«{loaderData.query}» բառով նյութ չկա</h2>
                <p>Փորձիր վերնագրից, նյութի տեքստից կամ քո նշումից ուրիշ բառ։</p>
              </div>
              <Link to="/saved">Ցույց տալ բոլոր պահվածները</Link>
            </div>
          ) : (
            <div className="saved-category-groups">
              {loaderData.groups.map((group) => (
                <SavedGroup
                  key={group.categorySlug}
                  group={group}
                  open={Boolean(loaderData.query)}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
