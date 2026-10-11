import { env } from "cloudflare:workers";
import { Bookmark } from "lucide-react";
import { memo, useCallback } from "react";
import { isRouteErrorResponse } from "react-router";

import type { Route } from "./+types/category";
import { getOptionalTelegramUser } from "../auth/telegram-user.server";
import {
  MaterialResultCard,
  openTelegramPost,
} from "../components/material-result-card";
import { SiteNav } from "../components/site-nav";
import { getActiveCategoryBySlug } from "../data/categories.server";
import type { PublicMaterial } from "../data/materials.server";
import { listPublicMaterialsByCategory } from "../data/materials.server";
import { listSavedMaterialIds } from "../data/saved-materials.server";
import { useSavedMaterials } from "../hooks/use-saved-materials";

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.category.name ?? "Բաժին";
  return [
    { title: `${title} — Թվային գրադարան` },
    { name: "robots", content: "noindex, nofollow" },
    { name: "theme-color", content: "#100817" },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
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

  const [materials, savedMaterialIds] = await Promise.all([
    listPublicMaterialsByCategory(env.DB, category.id, category.defaultSort),
    user ? listSavedMaterialIds(env.DB, user.id) : Promise.resolve([]),
  ]);

  return {
    category,
    materials,
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
    <li className="psalm-tile-shell">
      <a
        className="psalm-tile"
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
          className={`psalm-save${isSaved ? " is-saved" : ""}`}
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
}: {
  canSave: boolean;
  isPsalms: boolean;
  materials: PublicMaterial[];
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
    <ol className={`materials-list${isPsalms ? " psalms-grid" : ""}`}>
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

  return (
    <main className="category-page">
      <SiteNav actionHref="/" actionLabel="← Բաժիններ" />
      <header className="category-page-header">
        <p className="library-kicker">Թվային գրադարան</p>
        <h1>{category.name}</h1>
        <p className="category-page-count">
          {materials.length === 0 ? "Դեռ նյութ չկա" : `${materials.length} նյութ`}
        </p>
      </header>

      {materials.length === 0 ? (
        <section className="category-empty">
          <p>Այս բաժնում դեռ հրապարակված նյութ չկա։</p>
        </section>
      ) : (
        <MaterialsList
          canSave={loaderData.canSave}
          isPsalms={isPsalms}
          materials={materials}
          savedMaterialIds={loaderData.savedMaterialIds}
        />
      )}
    </main>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="category-page">
      <SiteNav actionHref="/" actionLabel="← Բաժիններ" />
      <header className="category-page-header">
        <p className="library-kicker">Թվային գրադարան</p>
        <h1>{isNotFound ? "Բաժինը չի գտնվել" : "Սխալ"}</h1>
        <p className="category-page-count">
          {isNotFound
            ? "Այս բաժինը գոյություն չունի կամ հասանելի չէ։"
            : "Էջը բացելիս անսպասելի սխալ է տեղի ունեցել։"}
        </p>
      </header>
    </main>
  );
}
