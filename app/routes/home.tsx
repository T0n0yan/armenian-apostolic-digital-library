import { env } from "cloudflare:workers";

import type { Route } from "./+types/home";
import { listActiveCategories } from "../data/categories.server";

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

export async function loader() {
  return { categories: await listActiveCategories(env.DB) };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="library-page">
      <header className="library-header">
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
          {loaderData.categories.map((category, index) => (
            <li className="category-card" key={category.id}>
              <span className="category-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="category-content">
                <strong>{category.name}</strong>
                <span>
                  {category.materialCount === 0
                    ? "Դեռ նյութ չկա"
                    : `${category.materialCount} նյութ`}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
