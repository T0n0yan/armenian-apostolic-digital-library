import {env} from "cloudflare:workers";
import {ArrowRight, LoaderCircle, RotateCw, Search} from "lucide-react";
import {memo} from "react";
import {Form, Link, useNavigation} from "react-router";

import type {Route} from "./+types/home";
import {CategoryIcon} from "../components/category-icon";
import {PageHeader, PageShell} from "../components/page-layout";
import {SiteNav} from "../components/site-nav";
import {interactiveGlassCard} from "../components/ui-styles";
import type {CategorySummary} from "../data/categories.server";
import {listActiveCategories} from "../data/categories.server";
import {isPendingNavigation} from "../../shared/navigation-state";
import LastSupperImg from '../assets/last-supper.webp'
import AngelLeft from "../assets/angel-left.webp"
import CornerDecoration from "../assets/corner-decoration.webp"
import ArmenianEternity from "../assets/armenian-eternity.svg"
import {resolveContentCategoryId} from "../../shared/telegram-bridge-contract";

export function meta({}: Route.MetaArgs) {
    return [{title: "Հայ Առաքելական Սուրբ Եկեղեցու թվային գրադարան"}, {
        name: "description", content: "Հայ Առաքելական Սուրբ Եկեղեցուն նվիրված թվային գրադարան։",
    }, {name: "robots", content: "noindex, nofollow"},];
}
export async function loader({request}: Route.LoaderArgs) {
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    return {categories: await listActiveCategories(env.DB, refresh, request.signal)};
}
// Warm liturgical hues for each card's corner glow; a topic keeps its hue across visits.
const CARD_GLOWS = [
    "rgb(217 160 70 / 34%)",  // gold
    "rgb(178 58 72 / 30%)",   // crimson
    "rgb(122 146 84 / 30%)",  // olive
    "rgb(74 120 168 / 30%)",  // azure
    "rgb(138 82 150 / 32%)",  // plum
    "rgb(206 116 64 / 30%)",  // amber
];

function glowFor(id: string) {
    let hash = 0;
    for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return CARD_GLOWS[hash % CARD_GLOWS.length];
}

const ICON_MOTIONS: Record<string, { motion: string; duration: string }> = {
    category_gospel_teachings: {motion: "icon-page", duration: "6s"},
    category_prayers: {motion: "icon-heart", duration: "4.5s"},
    category_psalms: {motion: "icon-sway", duration: "5s"},
    category_saints_lives: {motion: "icon-bob", duration: "4s"},
    category_daily_readings: {motion: "icon-tick", duration: "5.5s"},
    category_bible_questions: {motion: "icon-tilt", duration: "6s"},
};

const CategoryCard = memo(function CategoryCard({category, index}: { category: CategorySummary; index: number }) {
    const navigation = useNavigation();
    const targetPath = `/categories/${category.slug}`;
    const isOpening = isPendingNavigation(navigation.state, navigation.location?.pathname, targetPath);
    const motion = ICON_MOTIONS[resolveContentCategoryId(category.id, category.name) ?? ""];
    return (<li className="hero-rise" style={{animationDelay: `${380 + index * 70}ms`}}>
        <Link
            className={`${interactiveGlassCard} relative flex min-h-[76px] items-center gap-[14px] px-3.5 py-3 text-inherit no-underline active:scale-[.992] min-[560px]:min-h-[88px] min-[560px]:p-[16px] ${isOpening ? "border-[rgb(217_181_111/52%)] bg-glass-strong" : ""}`}
            style={{"--card-glow": glowFor(category.id)} as React.CSSProperties}
            to={targetPath}
            prefetch="intent"
            aria-busy={isOpening || undefined}
            onClick={(event) => { if (isOpening) event.preventDefault(); }}>
            <span className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_0%_50%,var(--card-glow),transparent_58%)]" aria-hidden="true"/>
            <img className="pointer-events-none absolute -top-[7px] -left-[6px] z-1 opacity-75" src={CornerDecoration} alt="" width={62} height={62} decoding="async"/>
            <img className="pointer-events-none absolute -right-[7px] -bottom-[6px] z-1 rotate-90 scale-x-[-1] opacity-75" src={CornerDecoration} alt="" width={62} height={62} decoding="async"/>
            <span
                className="topic-icon relative z-1 grid size-[42px] shrink-0 place-items-center rounded-full border border-[rgb(217_181_111/38%)] bg-[radial-gradient(circle_at_35%_30%,rgb(255_255_255/18%),transparent_65%)] text-gold-bright shadow-[inset_0_1px_0_rgb(255_255_255/18%)]"
                style={motion ? {"--icon-motion": motion.motion, "--icon-duration": motion.duration, "--icon-delay": `${index * 0.6}s`} as React.CSSProperties : undefined}
                aria-hidden="true">
                <CategoryIcon categoryId={category.id} categoryName={category.name} size={21} strokeWidth={1.5}/>
            </span>
            <span className="relative z-1 grid min-w-0 flex-1 gap-0.5">
                <strong className="font-noto text-[16px] leading-[22px] font-semibold min-[960px]:text-[17px] min-[960px]:leading-[23px]">{category.name}</strong>
                <span className="text-[12.5px] text-faint">
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
            <span className="relative z-1 mr-2 text-gold" aria-hidden="true">
                {isOpening ? <LoaderCircle className="animate-search-spin" size={19} strokeWidth={1.8}/> : <ArrowRight size={18} strokeWidth={1.8}/>}
            </span>
        </Link>
    </li>);
});

const CategoryGrid = memo(function CategoryGrid({categories}: { categories: CategorySummary[]; }) {
    return (<ol className="m-0 grid list-none gap-2.5 p-0 min-[560px]:grid-cols-2 min-[960px]:grid-cols-3">
        {categories.map((category, index) => (<CategoryCard key={category.id} category={category} index={index}/>))}
    </ol>);
});

/** Small Armenian cross for the affiliation seal. */
function ArmenianCross({size = 14}: { size?: number }) {
    return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v18M6 9h12"/>
        <path d="M12 3c-1.2 0-1.8.8-1.8 1.6M12 3c1.2 0 1.8.8 1.8 1.6M6 9c0-1.2-.8-1.8-1.6-1.8M6 9c0 1.2-.8 1.8-1.6 1.8M18 9c0-1.2.8-1.8 1.6-1.8M18 9c0 1.2.8 1.8 1.6 1.8M12 21c-1.2 0-1.8-.8-1.8-1.6M12 21c1.2 0 1.8-.8 1.8-1.6"/>
    </svg>);
}

function HomeTitle() {
    return (<header className="relative z-5 -mt-[6px] grid justify-items-center gap-3 px-2 pt-1 pb-2 text-center min-[560px]:gap-4">
        <div className="hero-rise flex w-full max-w-[340px] items-center gap-3 text-gold" aria-hidden="true">
            <span className="h-px flex-1 bg-[linear-gradient(90deg,transparent,currentColor)] opacity-60"/>
            <span className="gold-mark size-[22px]" style={{"--mark": `url(${ArmenianEternity})`} as React.CSSProperties}/>
            <span className="h-px flex-1 bg-[linear-gradient(270deg,transparent,currentColor)] opacity-60"/>
        </div>
        <h1 className="hero-rise hero-rise-delay m-0 font-noto text-[33px] leading-[1.12] font-medium tracking-[-0.6px] text-balance text-ink min-[390px]:text-[36px] min-[560px]:text-[46px] min-[960px]:text-[56px]">
            Հոգևոր ժառանգություն
        </h1>
        <p className="hero-rise hero-rise-delay-2 m-0 inline-flex items-center gap-2 rounded-full border border-[rgb(217_181_111/38%)] bg-[linear-gradient(180deg,rgb(217_181_111/14%),rgb(217_181_111/5%))] px-3.5 py-1.5 text-[12px] font-semibold tracking-[0.2px] text-gold-bright shadow-[inset_0_1px_0_rgb(255_255_255/14%)] min-[560px]:text-[13px]">
            <ArmenianCross/>
            Նվիրված Հայ Առաքելական Սուրբ Եկեղեցուն
        </p>
    </header>);
}

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
        <HomeTitle/>
        <Form className="hero-rise hero-rise-delay-2 mt-2 mb-1 flex min-h-[50px] w-full items-center gap-[10px] rounded-[16px] border border-glass-border bg-control px-[14px] text-faint shadow-card backdrop-blur-md focus-within:border-[rgb(217_181_111/45%)]" action="/search" method="get" role="search">
            <Search aria-hidden="true" size={19} strokeWidth={1.9}/>
            <input className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint" type="search" name="q" placeholder="Փնտրել աղոթք, սաղմոս, սուրբ…" aria-label="Որոնել գրադարանում" autoComplete="off" minLength={2} enterKeyHint="search"/>
        </Form>
        <section className="mt-4 grid gap-3" aria-labelledby="categories-title">
            <h2 className="m-0 flex items-center gap-3 px-1 text-[12px] font-semibold tracking-[1.6px] text-gold uppercase" id="categories-title">
                Բաժիններ
                <span className="h-px flex-1 bg-[linear-gradient(90deg,rgb(217_181_111/45%),transparent)]" aria-hidden="true"/>
            </h2>
            <CategoryGrid categories={loaderData.categories}/>
        </section>
        <SiteNav/>
    </PageShell>);
}

export function ErrorBoundary() {
    return (<PageShell><SiteNav/><PageHeader eyebrow="Telegram Bridge" title="Թեմաները չհաջողվեց բեռնել" description="Ստուգիր local Bridge կապը և կրկին փորձիր։"/><button className="mt-4 inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-[13px] border border-glass-border bg-subtle px-4 text-[12px] font-bold text-gold-bright" type="button" onClick={() => window.location.reload()}><RotateCw aria-hidden="true" size={16}/> Կրկին փորձել</button></PageShell>);
}
