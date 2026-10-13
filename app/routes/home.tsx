import {env} from "cloudflare:workers";
import {ArrowRight, LoaderCircle, Search} from "lucide-react";
import {memo} from "react";
import {Form, Link, useNavigation} from "react-router";

import type {Route} from "./+types/home";
import {getOptionalTelegramAdmin, hasAdminNavigationCookie,} from "../auth/admin.server";
import {CategoryIcon} from "../components/category-icon";
import {PageHeader, PageShell} from "../components/page-layout";
import {SiteNav} from "../components/site-nav";
import {countBadge, interactiveGlassCard, sectionHeader, sectionTitle,} from "../components/ui-styles";
import type {CategorySummary} from "../data/categories.server";
import {listActiveCategories} from "../data/categories.server";
import {useDebouncedFormSubmit} from "../hooks/use-debounced-form-submit";
import LastSupperImg from '../assets/last-supper.webp'
import AngelLeft from "../assets/angel-left.webp"
import HomeVine from "../assets/home-vine.png"

const HomeSearch = memo(function HomeSearch() {
    const {cancelPending, formRef, scheduleSubmit} = useDebouncedFormSubmit(1_000);
    const navigation = useNavigation();
    const isSearching = navigation.location?.pathname === "/search";

    return (<Form
        ref={formRef}
        className="text-[16px] font-noto flex py-0 pl-2 pr-1 text-faint shadow-card min-h-[42px] w-full items-center gap-[10px] rounded-[10px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_55%),var(--glass)]"
        action="/search"
        method="get"
        role="search"
        onSubmit={cancelPending}
    >
        <Search aria-hidden="true" size={20} strokeWidth={2}/>
        <input
            className="text-[16px] font-noto min-w-0 flex-1 border-0 bg-transparent text-ink outline-none placeholder:text-faint"
            type="search"
            name="q"
            placeholder="Փնտրել ամբողջ գրադարանում…"
            aria-label="Փնտրել ամբողջ գրադարանում"
            autoComplete="off"
            onInput={scheduleSubmit}
        />
        <button
            className="grid size-[30px] shrink-0 cursor-pointer place-items-center rounded-[6px] border border-[rgb(217_181_111/28%)] bg-[linear-gradient(145deg,var(--plum),#5d356c)] p-0 text-[#fffaf3]"
            type="submit" aria-label="Որոնել">
            {isSearching ? (<LoaderCircle
                className="animate-search-spin"
                aria-hidden="true"
                size={19}
            />) : (<ArrowRight aria-hidden="true" size={19} strokeWidth={1.9}/>)}
        </button>
    </Form>);
});

const CategoryCard = memo(function CategoryCard({
                                                    category,
                                                }: {
    category: CategorySummary;
}) {
    return (<li>
        <Link
            className={`${interactiveGlassCard} flex min-h-[55px] items-center gap-[13px] py-1 px-2 text-inherit no-underline min-[560px]:min-h-[88px] min-[560px]:p-[15px]`}
            to={`/categories/${category.slug}`}>
        <span
            className="grid size-[40px] shrink-0 place-items-center rounded-[10px] border border-[rgb(217_181_111/20%)] bg-[image:var(--icon-surface)] text-icon-ink shadow-[inset_0_1px_0_rgb(255_255_255/16%),0_12px_24px_rgb(8_2_13/22%)]"
            aria-hidden="true">
          <CategoryIcon categoryId={category.id} size={20} strokeWidth={1}/>
        </span>
            <span className="grid min-w-0 flex-1 gap-1">
          <strong
              className="text-[15px] leading-[21px] min-[960px]:text-[17px] min-[960px]:leading-[23px]">{category.name}</strong>
          <span className="text-[13px] text-faint">
            {category.materialCount === 0 ? "Դեռ նյութ չկա" : `${category.materialCount} նյութ`}
          </span>
        </span>
            <span className="relative z-1 text-gold" aria-hidden="true">
          <ArrowRight size={19} strokeWidth={1.8}/>
        </span>
        </Link>
    </li>);
});

const CategoryGrid = memo(function CategoryGrid({
                                                    categories,
                                                }: {
    categories: CategorySummary[];
}) {
    return (<ol className="m-0 grid list-none gap-2 p-0 min-[560px]:grid-cols-2 min-[960px]:grid-cols-3">
        {categories.map((category) => (<CategoryCard key={category.id} category={category}/>))}
    </ol>);
});

export function meta({}: Route.MetaArgs) {
    return [{title: "Հայ Առաքելական Սուրբ Եկեղեցու թվային գրադարան"}, {
        name: "description", content: "Հայ Առաքելական Սուրբ Եկեղեցուն նվիրված թվային գրադարան։",
    }, {name: "robots", content: "noindex, nofollow"}, {name: "theme-color", content: "#100817"},];
}

export async function loader({request}: Route.LoaderArgs) {
    const [categories, telegramAdmin] = await Promise.all([listActiveCategories(env.DB), getOptionalTelegramAdmin(request, env.DB),]);

    return {
        categories, showAdminLink: Boolean(telegramAdmin || hasAdminNavigationCookie(request),),
    };
}

export default function Home({loaderData}: Route.ComponentProps) {
    return (<PageShell width="library">
        <div className="relative mt-[10px] w-full pt-[12px] min-[560px]:mt-[16px] min-[560px]:pt-[20px]">
            <div className="absolute top-[12px] -left-[10px] z-4 w-[27%] min-[560px]:top-[20px]">
                <img className="block h-auto w-full" src={AngelLeft} alt="" width={480} height={480}/>
            </div>
            <img
                className="relative z-1 block h-auto w-full"
                src={LastSupperImg}
                alt="Խորհրդավոր ընթրիքը"
                width={1600}
                height={900}
            />
            <div className="absolute top-[12px] -right-[10px] z-4 w-[27%] scale-x-[-1] min-[560px]:top-[20px]">
                <img className="block h-auto w-full" src={AngelLeft} alt="" width={480} height={480}/>
            </div>
        </div>
        <div
            className="w-[95%] mx-auto transform translate-y-[-15px] bg-transparent rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.3)] backdrop-blur-[5.3px]">
            <PageHeader
                eyebrow="Հայ Առաքելական Եկեղեցուն նվիրված"
                title="Հոգևոր ժառանգություն"
                // description="Բացահայտեք, ճանաչեք և պահպանեք մեր հոգևոր ժառանգությունը։"
                home
            />
        </div>
        <HomeSearch/>
        <section className="grid gap-3 mt-2" aria-labelledby="categories-title">
            <div className={sectionHeader}>
                <h2 className={sectionTitle} id="categories-title">Բաժիններ</h2>
                {/*<span className={countBadge}>{loaderData.categories.length}</span>*/}
            </div>

            <CategoryGrid categories={loaderData.categories}/>
        </section>
        <SiteNav showAdminLink={loaderData.showAdminLink}/>
    </PageShell>);
}
