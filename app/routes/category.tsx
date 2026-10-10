import { env } from "cloudflare:workers";
import { isRouteErrorResponse, Link } from "react-router";

import type { Route } from "./+types/category";
import { getActiveCategoryBySlug } from "../data/categories.server";
import { listPublicMaterialsByCategory } from "../data/materials.server";

const mediaLabels: Record<string, string> = {
  audio: "Աուդիո",
  video: "Վիդեո",
  photo: "Նկար",
  poll: "Հարցում",
};

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.category.name ?? "Բաժին";
  return [
    { title: `${title} — Թվային գրադարան` },
    { name: "robots", content: "noindex, nofollow" },
    { name: "theme-color", content: "#f6f2e9" },
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

function formatMaterialDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("hy-AM", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default function Category({ loaderData }: Route.ComponentProps) {
  const { category, materials } = loaderData;

  return (
    <main className="category-page">
      <header className="category-page-header">
        <Link className="category-back-link" to="/">
          ← Բոլոր բաժինները
        </Link>
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
        <ol className="materials-list">
          {materials.map((material) => {
            const date = formatMaterialDate(material.dateValue);
            return (
              <li key={material.id}>
                <a
                  className="material-card"
                  href={material.telegramUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="material-card-content">
                    {date ? <span className="material-date">{date}</span> : null}
                    <strong>{material.title}</strong>
                    {material.mediaTypes.length > 0 ? (
                      <span className="material-media-list">
                        {material.mediaTypes.map((mediaType) => (
                          <span key={mediaType}>
                            {mediaLabels[mediaType] ?? mediaType}
                          </span>
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
          })}
        </ol>
      )}
    </main>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="category-page">
      <header className="category-page-header">
        <Link className="category-back-link" to="/">
          ← Բոլոր բաժինները
        </Link>
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
