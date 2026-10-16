import {env} from "cloudflare:workers";
import {ArrowRight, RefreshCw, RotateCw} from "lucide-react";
import {memo} from "react";
import {Link} from "react-router";

import type {Route} from "./+types/home";
import {CategoryIcon} from "../components/category-icon";
import {PageHeader, PageShell} from "../components/page-layout";
import {SiteNav} from "../components/site-nav";
import {interactiveGlassCard, sectionHeader, sectionTitle,} from "../components/ui-styles";
import type {CategorySummary} from "../data/categories.server";
import {listActiveCategories} from "../data/categories.server";
import LastSupperImg from '../assets/last-supper.webp'
import AngelLeft from "../assets/angel-left.webp"
import CornerDecoration from "../assets/corner-decoration.webp"

export function meta({}: Route.MetaArgs) {
    return [{title: "Հայ Առաքելական Սուրբ Եկեղեցու թվային գրադարան"}, {
        name: "description", content: "Հայ Առաքելական Սուրբ Եկեղեցուն նվիրված թվային գրադարան։",
    }, {name: "robots", content: "noindex, nofollow"}, {name: "theme-color", content: "#100817"},];
}
export async function loader({request}: Route.LoaderArgs) {
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    return {categories: await listActiveCategories(env.DB, refresh)};
}
const CategoryCard = memo(function CategoryCard({category}: { category: CategorySummary; }) {
    const topicColor = category.iconColor === null
        ? "var(--gold)"
        : `#${category.iconColor.toString(16).padStart(6, "0")}`;
    return (<li>
        <Link
            className={`${interactiveGlassCard} relative flex min-h-[55px] items-center gap-[13px] py-1 px-2 text-inherit no-underline min-[560px]:min-h-[88px] min-[560px]:p-[15px]`}
            to={`/categories/${category.slug}`}>
            <img className="absolute -top-[12px] -left-[9.5px] z-1" src={CornerDecoration} alt="" width={100} height={100} decoding="async"/>
            <img className="absolute -bottom-[9.5px] -right-[12px] transform rotate-90 scale-x-[-1] z-1" src={CornerDecoration} alt="" width={100} height={100} decoding="async"/>

        <span
            // rounded-[6px] border border-[rgb(217_181_111/20%)] bg-[image:var(--icon-surface)] shadow-[inset_0_1px_0_rgb(255_255_255/16%),0_12px_24px_rgb(8_2_13/22%)]
            className="grid size-[34px] shrink-0 place-items-center rounded-full border border-white/15 bg-[var(--topic-color)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/25%)]"
            style={{"--topic-color": topicColor} as React.CSSProperties}
            data-telegram-emoji-id={category.iconEmojiId ?? undefined}
            aria-hidden="true">
          <CategoryIcon categoryId={category.id} size={20} strokeWidth={1}/>
        </span>
            <span className="grid min-w-0 flex-1 gap-1">
          <strong
              className="text-[15px] leading-[21px] min-[960px]:text-[17px] min-[960px]:leading-[23px]">{category.name}</strong>
          <span className="text-[13px] text-faint">
            {category.materialCount === null
                ? category.messageCount === null
                    ? "Բացել թեման"
                    : `${category.messageCount} հաղորդագրություն`
                : category.materialCount === 0
                    ? "Դեռ նյութ չկա"
                    : `${category.materialCount} նյութ`}
            {category.status !== "open" ? ` · ${category.status === "closed" ? "փակված" : "թաքցված"}` : ""}
          </span>
        </span>
            <span className="relative z-1 text-gold" aria-hidden="true">
          <ArrowRight size={19} strokeWidth={1.8}/>
        </span>
        </Link>
    </li>);
});

const CategoryGrid = memo(function CategoryGrid({categories}: { categories: CategorySummary[]; }) {
    return (<ol className="m-0 grid list-none gap-2 p-0 min-[560px]:grid-cols-2 min-[960px]:grid-cols-3">
        {categories.map((category) => (<CategoryCard key={category.id} category={category}/>))}
    </ol>);
});


export default function Home({loaderData}: Route.ComponentProps) {
    return (<PageShell width="library">
        <div className="relative mt-[10px] w-full pt-[12px] min-[560px]:mt-[16px] min-[560px]:pt-[20px]">
            <div className="absolute top-[12px] -left-[10px] z-4 w-[27%] min-[560px]:top-[20px]">
                <img className="block h-auto w-full" src={AngelLeft} alt="" width={540} height={728} decoding="async"/>
            </div>
            <img
                className="relative z-1 block h-auto w-full"
                src={LastSupperImg}
                alt="Խորհրդավոր ընթրիքը"
                width={1774}
                height={887}
                fetchPriority="high"
                decoding="async"
            />
            <div className="absolute top-[12px] -right-[10px] z-4 w-[27%] scale-x-[-1] min-[560px]:top-[20px]">
                <img className="block h-auto w-full" src={AngelLeft} alt="" width={540} height={728} decoding="async"/>
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
        {/*<HomeSearch/>*/}
        <section className="grid gap-3 mt-2" aria-labelledby="categories-title">
            <div className={sectionHeader}>
                <h2 className={sectionTitle} id="categories-title">Բաժիններ</h2>
                <Link className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-2 text-[11px] font-bold text-gold-bright no-underline hover:bg-subtle" to="/?refresh=1" reloadDocument aria-label="Թարմացնել Telegram թեմաների ցանկը"><RefreshCw aria-hidden="true" size={14}/><span className="hidden min-[560px]:inline">Թարմացնել</span></Link>
            </div>

            <CategoryGrid categories={loaderData.categories}/>
        </section>
        <SiteNav/>
    </PageShell>);
}

export function ErrorBoundary() {
    return (<PageShell><SiteNav/><PageHeader eyebrow="Telegram Bridge" title="Թեմաները չհաջողվեց բեռնել" description="Ստուգիր local Bridge կապը և կրկին փորձիր։"/><button className="mt-4 inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-[13px] border border-glass-border bg-subtle px-4 text-[12px] font-bold text-gold-bright" type="button" onClick={() => window.location.reload()}><RotateCw aria-hidden="true" size={16}/> Կրկին փորձել</button></PageShell>);
}
