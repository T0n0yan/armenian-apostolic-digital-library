import {env} from "cloudflare:workers";
import {ArrowRight, LoaderCircle, RotateCw, Search} from "lucide-react";
import {memo, useRef, useState} from "react";
import {Form, Link, useNavigate, useNavigation} from "react-router";

import type {Route} from "./+types/home";
import {CategoryIcon} from "../components/category-icon";
import {PageHeader, PageShell} from "../components/page-layout";
import {SiteNav} from "../components/site-nav";
import {DailyVerseCard} from "../components/daily-verse";
import {SearchSuggestions} from "../components/search-suggestions";
import type {CategorySummary} from "../data/categories.server";
import {listActiveCategories} from "../data/categories.server";
import {isPendingNavigation} from "../../shared/navigation-state";
import LastSupperImg from '../assets/last-supper.webp'
import {ArtImage} from "../components/art-image";
import AngelLeft from "../assets/angel-left.webp"
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
const CategoryCard = memo(function CategoryCard({category, index}: { category: CategorySummary; index: number }) {
    const navigation = useNavigation();
    const targetPath = `/categories/${category.slug}`;
    const isOpening = isPendingNavigation(navigation.state, navigation.location?.pathname, targetPath);
    return (<li className="hero-rise" style={{animationDelay: `${380 + index * 70}ms`}}>
        <Link
            className={`frosted-card relative flex min-h-[76px] items-center gap-[14px] px-3.5 py-3 text-inherit no-underline min-[560px]:min-h-[88px] min-[560px]:p-[16px] ${isOpening ? "is-opening" : ""}`}
            to={targetPath}
            prefetch="intent"
            aria-busy={isOpening || undefined}
            onClick={(event) => { if (isOpening) event.preventDefault(); }}>
            <span
                className="topic-icon relative z-1 grid size-[42px] shrink-0 place-items-center rounded-full border border-[rgb(217_181_111/38%)] bg-[radial-gradient(circle_at_35%_30%,rgb(255_255_255/18%),transparent_65%)] text-gold-bright shadow-[inset_0_1px_0_rgb(255_255_255/18%)]"
                style={{"--ti-delay": `${index * 0.45}s`} as React.CSSProperties}
                aria-hidden="true">
                <CategoryIcon categoryId={category.id} categoryName={category.name} size={24}/>
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
        <p className="hero-rise hero-rise-delay-2 m-0 grid max-w-full justify-items-center gap-0.5 rounded-[18px] border border-[rgb(217_181_111/38%)] bg-[linear-gradient(180deg,rgb(217_181_111/14%),rgb(217_181_111/5%))] px-4 py-1.5 text-center text-gold-bright shadow-[inset_0_1px_0_rgb(255_255_255/14%)]">
            <span className="inline-flex items-center gap-1.5 text-[clamp(11px,3.2vw,13.5px)] leading-snug font-semibold"><ArmenianCross size={12}/>Հայաստանյայց Առաքելական Սուրբ Եկեղեցուն<ArmenianCross size={12}/></span>
            <span className="text-[10.5px] font-semibold tracking-[2px] text-gold uppercase">նվիրված</span>
        </p>
    </header>);
}

/** The home search box: suggestions as you type, a search button, and results after a pause. */
function HomeSearch() {
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const timer = useRef<number | undefined>(undefined);
    const [value, setValue] = useState("");
    const go = (query: string) => {
        window.clearTimeout(timer.current);
        const trimmed = query.trim();
        if (Array.from(trimmed).length >= 2) navigate(`/search?q=${encodeURIComponent(trimmed)}&focus=1`);
    };
    return (<Form className="hero-rise hero-rise-delay-2 relative z-30 mt-3 mb-1 flex min-h-[52px] w-full items-center gap-[10px] rounded-[16px] border border-glass-border bg-control pr-[6px] pl-[14px] text-faint shadow-card focus-within:border-[rgb(217_181_111/45%)]" action="/search" method="get" role="search" onSubmit={(event) => { event.preventDefault(); go(value); }}>
        <Search aria-hidden="true" size={19} strokeWidth={1.9}/>
        <SearchSuggestions inputRef={inputRef} onPick={go}/>
        <input ref={inputRef} className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint" type="search" name="q" placeholder="Փնտրել աղոթք, սաղմոս, սուրբ…" aria-label="Որոնել գրադարանում" autoComplete="off" minLength={2} enterKeyHint="search"
            value={value} onChange={(event) => {
                const next = event.target.value;
                setValue(next);
                window.clearTimeout(timer.current);
                // Results open by themselves after a short pause in typing.
                if (Array.from(next.trim()).length >= 2) timer.current = window.setTimeout(() => go(next), 900);
            }}/>
        <button className={`grid size-10 shrink-0 cursor-pointer place-items-center rounded-[12px] border-0 bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[#2a1708] shadow-[0_6px_16px_rgb(150_100_30/25%)] transition-[opacity,transform] duration-200 ${value.trim() ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0"}`} type="submit" aria-label="Որոնել">
            <ArrowRight aria-hidden="true" size={18}/>
        </button>
    </Form>);
}

export default function Home({loaderData}: Route.ComponentProps) {
    return (<PageShell width="library">
        <div className="relative mt-[10px] w-full pt-[12px] min-[560px]:mt-[16px] min-[560px]:pt-[20px]">
            <div className="absolute top-[12px] -left-[10px] z-4 w-[27%] min-[560px]:top-[20px]">
                <img className="block h-auto w-full" src={AngelLeft} alt="" width={540} height={728} decoding="async"/>
            </div>
            <ArtImage
                className="relative z-1 block h-auto w-full"
                src={LastSupperImg}
                sizes="(max-width: 1100px) 100vw, 1100px"
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
        <div className="hero-rise hero-rise-delay-2 mt-2"><DailyVerseCard/></div>
        <HomeSearch/>
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
