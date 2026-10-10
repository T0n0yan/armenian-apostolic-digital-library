import { env } from "cloudflare:workers";
import { memo } from "react";
import { Link } from "react-router";

import type { Route } from "./+types/home";
import { hasAdminNavigationCookie } from "../auth/admin.server";
import type { CategorySummary } from "../data/categories.server";
import { listActiveCategories } from "../data/categories.server";

const CATEGORY_ICONS: Record<string, string> = {
  category_saints_lives: "🕊️",
  category_gospel_teachings: "📚",
  category_psalms: "🪉",
  category_daily_readings: "📅",
  category_bible_questions: "❓",
  category_prayers: "🙏",
  category_holy_sites_armenia: "⛪",
};

const CategoryCard = memo(function CategoryCard({
  category,
}: {
  category: CategorySummary;
}) {
  return (
    <li>
      <Link className="category-card" to={`/categories/${category.slug}`}>
        <span className="category-symbol" aria-hidden="true">
          {CATEGORY_ICONS[category.id] ?? "•"}
        </span>
        <span className="category-content">
          <strong>{category.name}</strong>
          <span>
            {category.materialCount === 0
              ? "Դեռ նյութ չկա"
              : `${category.materialCount} նյութ`}
          </span>
        </span>
        <span className="category-arrow" aria-hidden="true">
          →
        </span>
      </Link>
    </li>
  );
});

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Հայ Առաքելական Սուրբ Եկեղեցու թվային գրադարան" },
    {
      name: "description",
      content: "Հայ Առաքելական Սուրբ Եկեղեցուն նվիրված թվային գրադարան։",
    },
    { name: "robots", content: "noindex, nofollow" },
    { name: "theme-color", content: "#f6f2e9" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  return {
    categories: await listActiveCategories(env.DB),
    showAdminLink: hasAdminNavigationCookie(request),
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="library-page">
      <header className="library-header">
        {loaderData.showAdminLink ? (
          <Link className="library-admin-link" to="/admin">
            Կառավարում
          </Link>
        ) : null}
        <p className="library-kicker">Թվային գրադարան</p>
        <h1>Հայ Առաքելական Սուրբ Եկեղեցի</h1>
        <p className="library-intro">
          Գտեք խմբում հրապարակված նյութերը՝ ըստ բաժինների։
        </p>
      </header>

      <section className="categories-section" aria-labelledby="categories-title">
        <div className="section-heading">
          <h2 id="categories-title">Բաժիններ</h2>
          <span>{loaderData.categories.length}</span>
        </div>

        <ol className="categories-list">
          {loaderData.categories.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </ol>
      </section>
    </main>
  );
}
