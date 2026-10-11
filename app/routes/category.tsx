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
    <li className="relative animate-glass-enter">
      <a
        className="grid min-h-[50px] place-items-center rounded-[15px] border border-glass-border bg-[linear-gradient(145deg,rgb(255_255_255/7%),transparent_46%),var(--card-glass)] text-[0.9rem] font-[750] text-ink no-underline shadow-card transition-[border-color,color,transform] duration-[160ms] hover:-translate-y-px hover:border-[rgb(217_181_111/34%)] hover:text-gold-bright focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgb(217_181_111/42%)]"
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
    <main className="mx-auto min-h-svh w-[min(100%,940px)] pt-[calc(var(--tg-content-safe-area-inset-top,0px)+12px)] pr-[calc(var(--tg-content-safe-area-inset-right,0px)+clamp(14px,3vw,32px))] pb-[calc(var(--tg-content-safe-area-inset-bottom,0px)+clamp(44px,7vw,88px))] pl-[calc(var(--tg-content-safe-area-inset-left,0px)+clamp(14px,3vw,32px))] min-[560px]:pt-[calc(var(--tg-content-safe-area-inset-top,0px)+20px)]">
      <SiteNav actionHref="/" actionLabel="← Բաժիններ" />
      <header className="px-[clamp(2px,1vw,10px)] pt-[clamp(48px,8vw,92px)] pb-[clamp(34px,6vw,64px)] min-[1440px]:pt-[82px]">
        <p className="m-0 text-[clamp(0.7rem,1.3vw,0.78rem)] font-extrabold tracking-[0.1em] text-gold uppercase">Թվային գրադարան</p>
        <h1 className="mt-[13px] mb-0 max-w-[860px] text-[clamp(1.85rem,4.5vw,3.65rem)] leading-[1.06] font-[740] tracking-[-0.035em] text-balance">{category.name}</h1>
        <p className="mt-[18px] mb-0 max-w-[650px] text-[clamp(0.92rem,1.5vw,1.05rem)] leading-[1.65] text-muted">
          {materials.length === 0 ? "Դեռ նյութ չկա" : `${materials.length} նյութ`}
        </p>
      </header>

      {materials.length === 0 ? (
        <section className="rounded-[18px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] p-[22px] shadow-glass">
          <p className="m-0 text-muted">Այս բաժնում դեռ հրապարակված նյութ չկա։</p>
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
    <main className="mx-auto min-h-svh w-[min(100%,940px)] pt-[calc(var(--tg-content-safe-area-inset-top,0px)+12px)] pr-[calc(var(--tg-content-safe-area-inset-right,0px)+clamp(14px,3vw,32px))] pb-[calc(var(--tg-content-safe-area-inset-bottom,0px)+clamp(44px,7vw,88px))] pl-[calc(var(--tg-content-safe-area-inset-left,0px)+clamp(14px,3vw,32px))] min-[560px]:pt-[calc(var(--tg-content-safe-area-inset-top,0px)+20px)]">
      <SiteNav actionHref="/" actionLabel="← Բաժիններ" />
      <header className="px-[clamp(2px,1vw,10px)] pt-[clamp(48px,8vw,92px)] pb-[clamp(34px,6vw,64px)] min-[1440px]:pt-[82px]">
        <p className="m-0 text-[clamp(0.7rem,1.3vw,0.78rem)] font-extrabold tracking-[0.1em] text-gold uppercase">Թվային գրադարան</p>
        <h1 className="mt-[13px] mb-0 max-w-[860px] text-[clamp(1.85rem,4.5vw,3.65rem)] leading-[1.06] font-[740] tracking-[-0.035em] text-balance">{isNotFound ? "Բաժինը չի գտնվել" : "Սխալ"}</h1>
        <p className="mt-[18px] mb-0 max-w-[650px] text-[clamp(0.92rem,1.5vw,1.05rem)] leading-[1.65] text-muted">
          {isNotFound
            ? "Այս բաժինը գոյություն չունի կամ հասանելի չէ։"
            : "Էջը բացելիս անսպասելի սխալ է տեղի ունեցել։"}
        </p>
      </header>
    </main>
  );
}
