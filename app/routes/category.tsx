import { env } from "cloudflare:workers";
import { memo, type MouseEvent } from "react";
import { isRouteErrorResponse } from "react-router";

import type { Route } from "./+types/category";
import { SiteNav } from "../components/site-nav";
import { getActiveCategoryBySlug } from "../data/categories.server";
import type { PublicMaterial } from "../data/materials.server";
import { listPublicMaterialsByCategory } from "../data/materials.server";
import { formatArmenianDate } from "../utils/armenian-date";

const mediaLabels: Record<string, string> = {
  audio: "Աուդիո",
  video: "Վիդեո",
  photo: "Նկար",
  poll: "Հարցում",
};

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: {
      openTelegramLink?: (url: string) => void;
      platform?: string;
    };
  };
};

function openTelegramPost(event: MouseEvent<HTMLAnchorElement>) {
  const webApp = (window as TelegramWindow).Telegram?.WebApp;
  if (!webApp?.openTelegramLink || webApp.platform === "unknown") return;

  event.preventDefault();
  webApp.openTelegramLink(event.currentTarget.href);
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.category.name ?? "Բաժին";
  return [
    { title: `${title} — Թվային գրադարան` },
    { name: "robots", content: "noindex, nofollow" },
    { name: "theme-color", content: "#100817" },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const category = await getActiveCategoryBySlug(env.DB, params.slug);

  if (!category) {
    throw new Response("Category not found", {
      status: 404,
      statusText: "Not Found",
    });
  }

  return {
    category,
    materials: await listPublicMaterialsByCategory(
      env.DB,
      category.id,
      category.defaultSort,
    ),
  };
}

const MaterialCard = memo(function MaterialCard({
  material,
}: {
  material: PublicMaterial;
}) {
  const date = formatArmenianDate(material.dateValue);

  return (
    <li>
      <a
        className="material-card"
        href={material.telegramUrl}
        target="_blank"
        rel="noreferrer"
        onClick={openTelegramPost}
      >
        <span className="material-card-content">
          {date ? <span className="material-date">{date}</span> : null}
          <strong>{material.title}</strong>
          {material.mediaTypes.length > 0 ? (
            <span className="material-media-list">
              {material.mediaTypes.map((mediaType) => (
                <span key={mediaType}>{mediaLabels[mediaType] ?? mediaType}</span>
              ))}
            </span>
          ) : null}
        </span>
        <span className="material-open" aria-hidden="true">
          ↗
        </span>
      </a>
    </li>
  );
});

const PsalmTile = memo(function PsalmTile({
  material,
}: {
  material: PublicMaterial;
}) {
  return (
    <li>
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
    </li>
  );
});

const MaterialsList = memo(function MaterialsList({
  isPsalms,
  materials,
}: {
  isPsalms: boolean;
  materials: PublicMaterial[];
}) {
  return (
    <ol className={`materials-list${isPsalms ? " psalms-grid" : ""}`}>
      {materials.map((material) =>
        isPsalms ? (
          <PsalmTile key={material.id} material={material} />
        ) : (
          <MaterialCard key={material.id} material={material} />
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
        <MaterialsList isPsalms={isPsalms} materials={materials} />
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
