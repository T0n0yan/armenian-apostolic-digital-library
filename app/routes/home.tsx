import { env } from "cloudflare:workers";
import { ArrowRight, LoaderCircle, Search } from "lucide-react";
import { memo } from "react";
import { Form, Link, useNavigation } from "react-router";

import type { Route } from "./+types/home";
import {
  getOptionalTelegramAdmin,
  hasAdminNavigationCookie,
} from "../auth/admin.server";
import { CategoryIcon } from "../components/category-icon";
import { SiteNav } from "../components/site-nav";
import type { CategorySummary } from "../data/categories.server";
import { listActiveCategories } from "../data/categories.server";
import { useDebouncedFormSubmit } from "../hooks/use-debounced-form-submit";

const HomeSearch = memo(function HomeSearch() {
  const { cancelPending, formRef, scheduleSubmit } =
    useDebouncedFormSubmit(1_000);
  const navigation = useNavigation();
  const isSearching = navigation.location?.pathname === "/search";

  return (
    <Form
      ref={formRef}
      className="mt-[26px] flex min-h-[54px] w-full items-center gap-[11px] rounded-[18px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_55%),var(--glass)] py-[7px] pr-[7px] pl-4 text-faint shadow-card"
      action="/search"
      method="get"
      role="search"
      onSubmit={cancelPending}
    >
      <Search aria-hidden="true" size={20} strokeWidth={1.9} />
      <input
        className="min-w-0 flex-1 border-0 bg-transparent text-ink outline-none placeholder:text-faint"
        type="search"
        name="q"
        placeholder="Փնտրել ամբողջ գրադարանում…"
        aria-label="Փնտրել ամբողջ գրադարանում"
        autoComplete="off"
        onInput={scheduleSubmit}
      />
      <button className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-[13px] border border-[rgb(217_181_111/28%)] bg-[linear-gradient(145deg,var(--plum),#5d356c)] p-0 text-[#fffaf3]" type="submit" aria-label="Որոնել">
        {isSearching ? (
          <LoaderCircle
            className="animate-search-spin"
            aria-hidden="true"
            size={19}
          />
        ) : (
          <ArrowRight aria-hidden="true" size={19} strokeWidth={1.9} />
        )}
      </button>
    </Form>
  );
});

const CategoryCard = memo(function CategoryCard({
  category,
}: {
  category: CategorySummary;
}) {
  return (
    <li>
      <Link className="relative isolate flex min-h-[84px] items-center gap-[13px] overflow-hidden rounded-[19px] border border-glass-border bg-[linear-gradient(145deg,rgb(255_255_255/7%),transparent_46%),var(--card-glass)] p-[15px] text-inherit no-underline shadow-card transition-[border-color,transform,background] duration-[180ms] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(115deg,rgb(255_255_255/13%),transparent_24%_74%,rgb(217_181_111/6%))] hover:-translate-y-0.5 hover:border-[rgb(217_181_111/30%)] hover:bg-[linear-gradient(145deg,rgb(255_255_255/10%),transparent_48%),var(--glass-strong)] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgb(217_181_111/42%)] min-[560px]:min-h-[98px] min-[560px]:p-[18px]" to={`/categories/${category.slug}`}>
        <span className="grid size-[46px] shrink-0 place-items-center rounded-[15px] border border-[rgb(217_181_111/20%)] bg-[image:var(--icon-surface)] text-icon-ink shadow-[inset_0_1px_0_rgb(255_255_255/16%),0_12px_24px_rgb(8_2_13/22%)]" aria-hidden="true">
          <CategoryIcon categoryId={category.id} size={22} strokeWidth={1.8} />
        </span>
        <span className="grid min-w-0 flex-1 gap-1">
          <strong className="text-[clamp(0.95rem,1.7vw,1.08rem)] leading-[1.35]">{category.name}</strong>
          <span className="text-[0.78rem] text-faint">
            {category.materialCount === 0
              ? "Դեռ նյութ չկա"
              : `${category.materialCount} նյութ`}
          </span>
        </span>
        <span className="relative z-1 text-gold" aria-hidden="true">
          <ArrowRight size={19} strokeWidth={1.8} />
        </span>
      </Link>
    </li>
  );
});

const CategoryGrid = memo(function CategoryGrid({
  categories,
}: {
  categories: CategorySummary[];
}) {
  return (
    <ol className="m-0 grid list-none gap-2.5 p-0 min-[560px]:grid-cols-2 min-[960px]:grid-cols-3">
      {categories.map((category) => (
        <CategoryCard key={category.id} category={category} />
      ))}
    </ol>
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
    { name: "theme-color", content: "#100817" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [categories, telegramAdmin] = await Promise.all([
    listActiveCategories(env.DB),
    getOptionalTelegramAdmin(request, env.DB),
  ]);

  return {
    categories,
    showAdminLink: Boolean(
      telegramAdmin || hasAdminNavigationCookie(request),
    ),
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto min-h-svh w-[min(100%,1180px)] pt-[calc(var(--tg-content-safe-area-inset-top,0px)+12px)] pr-[calc(var(--tg-content-safe-area-inset-right,0px)+clamp(14px,3vw,32px))] pb-[calc(var(--tg-content-safe-area-inset-bottom,0px)+clamp(44px,7vw,88px))] pl-[calc(var(--tg-content-safe-area-inset-left,0px)+clamp(14px,3vw,32px))] min-[560px]:pt-[calc(var(--tg-content-safe-area-inset-top,0px)+20px)] min-[1440px]:pt-[calc(var(--tg-content-safe-area-inset-top,0px)+26px)]">
      <SiteNav
        actionHref={loaderData.showAdminLink ? "/admin" : undefined}
        actionLabel={loaderData.showAdminLink ? "Կառավարում" : undefined}
      />
      <header className="px-[clamp(2px,1vw,10px)] pt-[clamp(48px,8vw,92px)] pb-[clamp(34px,6vw,64px)] min-[1440px]:pt-[104px]">
        <p className="m-0 text-[clamp(0.7rem,1.3vw,0.78rem)] font-extrabold tracking-[0.1em] text-gold uppercase">Թվային գրադարան</p>
        <h1 className="mt-[13px] mb-0 max-w-[860px] text-[clamp(2rem,5.2vw,4.35rem)] leading-[1.01] font-[740] tracking-[-0.035em] text-balance">Հայ Առաքելական Սուրբ Եկեղեցի</h1>
        <p className="mt-[18px] mb-0 max-w-[650px] text-[clamp(0.92rem,1.5vw,1.05rem)] leading-[1.65] text-muted">
          Գտեք խմբում հրապարակված նյութերը՝ ըստ բաժինների։
        </p>
        <HomeSearch />
      </header>

      <section className="grid gap-4" aria-labelledby="categories-title">
        <div className="flex items-center justify-between gap-3 px-1">
          <h2 className="m-0 text-[clamp(1rem,2vw,1.2rem)]" id="categories-title">Բաժիններ</h2>
          <span className="grid min-h-[34px] min-w-[34px] place-items-center rounded-full border border-glass-border text-[0.8rem] text-muted tabular-nums">{loaderData.categories.length}</span>
        </div>

        <CategoryGrid categories={loaderData.categories} />
      </section>
    </main>
  );
}
