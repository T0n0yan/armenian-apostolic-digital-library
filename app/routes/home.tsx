import { searchValidation } from "../utils/search-validation";
import {env} from "cloudflare:workers";
import { ArrowRight, LoaderCircle, Search } from "lucide-react";
import {memo, useRef, useState} from "react";
import {Form, Link, useNavigate, useNavigation} from "react-router";

import type {Route} from "./+types/home";
import {CategoryIcon} from "../components/category-icon";
import {EtiquetteIcon, PlacesIcon} from "../components/topic-icons";
import { PageShell } from "../components/page-layout";
import {SiteNav} from "../components/site-nav";
import {DailyVerseCard} from "../components/daily-verse";
import {HomeTitle} from "../components/home-title";
import {SearchSuggestions} from "../components/search-suggestions";
import type {CategorySummary} from "../data/categories.server";
import {listActiveCategories} from "../data/categories.server";
import {isPendingNavigation} from "../../shared/navigation-state";
import LastSupperImg from '../assets/last-supper.webp'
import {ArtImage, preloadArt} from "../components/art-image";
import {getCategoryImage} from "../components/section-header";
import AngelLeft from "../assets/angel-left.webp"
import AngelLeftSmall from "../assets/angel-left-240.webp"
// Հրեշտակը էկրանի 27%-ն է. փոքր էկրանին բավական է 240px տարբերակը։
const ANGEL_SRCSET = `${AngelLeftSmall} 240w, ${AngelLeft} 540w`;
const ANGEL_SIZES = "(max-width: 1180px) 25vw, 300px";
import {resolveContentCategoryId} from "../../shared/telegram-bridge-contract";
import { organizationJsonLd, seoMeta, websiteJsonLd } from "../utils/seo";
import { sectionPath } from "../utils/material-path";
import { RouteErrorPage } from "../components/error-page";
import { remember } from "../data/memory-cache.server";
import { listOverrides } from "../data/calendar.server";
import { todayLine } from "../utils/church-calendar";
import { yerevanDay } from "../utils/liturgy";

export function meta({}: Route.MetaArgs) {
    return seoMeta({
        title: "Apostolic.am — Հայաստանյայց Առաքելական Եկեղեցուն նվիրված | աղոթքներ, սաղմոսներ",
        description: "Հայ Առաքելական Սուրբ Եկեղեցու հոգևոր գրադարան. աղոթքներ, սաղմոսներ՝ ձայնագրությամբ, սրբերի վարքեր, Ավետարանի ուսուցում, օրվա ընթերցումներ և հարցեր Աստվածաշնչից։",
        path: "/",
        jsonLd: [websiteJsonLd, organizationJsonLd],
    });
}
export async function loader({request}: Route.LoaderArgs) {
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    const day = yerevanDay();
    const [categories, places, overrides] = await Promise.all([
        listActiveCategories(env.DB, refresh, request.signal),
        // The sacred places map is a section of its own, next to prayers and psalms.
        env.DB.prepare("SELECT COUNT(*) AS count FROM places WHERE published = 1").first<{ count: number }>().then((row) => row?.count ?? 0).catch(() => null),
        // «Այսօր» տողի ձեռքով ուղղումները (տոնացույց)
        remember(env.DB, `calendar-${day.slice(0, 4)}`, 600_000, () => listOverrides(env.DB, Number(day.slice(0, 4)))).catch(() => []),
    ]);
    return {categories, places, today: todayLine(day, overrides)};
}
/** «Այսօր»՝ տոնը և պահքը (տոնացույցից), եթե կան։ */
function TodayLine({today}: { today: ReturnType<typeof todayLine> }) {
    const parts = [...today.feasts, today.fast ? "Պահք" : ""].filter(Boolean);
    if (!parts.length) return null;
    return (<Link className="mx-auto mt-1 flex w-fit max-w-full items-center gap-2 px-3 py-1 text-center text-[13.5px] leading-snug text-ink no-underline" to={`/church/calendar#${today.day}`}>
        <span className="text-[11px] font-bold tracking-[1.2px] text-gold uppercase">Այսօր</span>
        <span className="min-w-0">{parts.join(" · ")}</span>
    </Link>);
}
const CategoryCard = memo(function CategoryCard({category, index}: { category: CategorySummary; index: number }) {
    const navigation = useNavigation();
    const targetPath = sectionPath(category);
    const isOpening = isPendingNavigation(navigation.state, navigation.location?.pathname, targetPath);
    return (<li className="hero-rise" style={{animationDelay: `${380 + index * 70}ms`}}>
        <Link
            className={`paper-card relative flex min-h-[76px] items-center gap-[14px] px-3.5 py-3 text-inherit no-underline min-[560px]:min-h-[88px] min-[560px]:p-[16px] ${isOpening ? "is-opening" : ""}`}
            to={targetPath}
            aria-busy={isOpening || undefined}
            // Start the section's picture as soon as a finger or pointer reaches the card.
            onPointerEnter={() => void preloadArt(getCategoryImage(category.id, category.name))}
            onTouchStart={() => void preloadArt(getCategoryImage(category.id, category.name))}
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
                    {/* A closed Telegram topic only means that just admins post there; readers aren't told. */}
                    {category.status === "hidden" ? " · թաքցված" : ""}
                </span>
            </span>
            <span className="relative z-1 mr-2 text-gold" aria-hidden="true">
                {isOpening ? <LoaderCircle className="animate-search-spin" size={19} strokeWidth={1.8}/> : <ArrowRight size={18} strokeWidth={1.8}/>}
            </span>
        </Link>
    </li>);
});

/** Կայքի սեփական բաժիններ (Սրբավայրեր, Վարք եկեղեցում)՝ նույն ձևով, ինչ Telegram-ից եկածները։ */
function SiteSectionCard({to, title, note, icon, index}: { to: string; title: string; note: string; icon: React.ReactNode; index: number }) {
    const navigation = useNavigation();
    const isOpening = isPendingNavigation(navigation.state, navigation.location?.pathname, to);
    return (<li className="hero-rise" style={{animationDelay: `${380 + index * 70}ms`}}>
        <Link className={`paper-card relative flex min-h-[76px] items-center gap-[14px] px-3.5 py-3 text-inherit no-underline min-[560px]:min-h-[88px] min-[560px]:p-[16px] ${isOpening ? "is-opening" : ""}`}
            to={to} aria-busy={isOpening || undefined} onClick={(event) => { if (isOpening) event.preventDefault(); }}>
            <span className="topic-icon relative z-1 grid size-[42px] shrink-0 place-items-center rounded-full border border-[rgb(217_181_111/38%)] bg-[radial-gradient(circle_at_35%_30%,rgb(255_255_255/18%),transparent_65%)] text-gold-bright shadow-[inset_0_1px_0_rgb(255_255_255/18%)]"
                style={{"--ti-delay": `${index * 0.45}s`} as React.CSSProperties} aria-hidden="true">
                {icon}
            </span>
            <span className="relative z-1 grid min-w-0 flex-1 gap-0.5">
                <strong className="font-noto text-[16px] leading-[22px] font-semibold min-[960px]:text-[17px] min-[960px]:leading-[23px]">{title}</strong>
                <span className="text-[12.5px] text-faint">{note}</span>
            </span>
            <span className="relative z-1 mr-2 text-gold" aria-hidden="true">
                {isOpening ? <LoaderCircle className="animate-search-spin" size={19} strokeWidth={1.8}/> : <ArrowRight size={18} strokeWidth={1.8}/>}
            </span>
        </Link>
    </li>);
}

const CategoryGrid = memo(function CategoryGrid({categories, places}: { categories: CategorySummary[]; places: number | null }) {
    // Right after prayers and psalms (whichever comes later), or last when neither is there.
    const kinds = categories.map((category) => resolveContentCategoryId(category.id, category.name));
    const after = Math.max(kinds.indexOf("category_prayers"), kinds.indexOf("category_psalms"));
    const at = after < 0 ? categories.length : after + 1;
    return (<ol className="m-0 grid list-none gap-2.5 p-0 min-[560px]:grid-cols-2 min-[960px]:grid-cols-3">
        {categories.slice(0, at).map((category, index) => (<CategoryCard key={category.id} category={category} index={index}/>))}
        <SiteSectionCard to="/places" title="Սրբավայրեր" note={places ? `${places} սրբավայր քարտեզում` : "Եկեղեցիներ և վանքեր քարտեզում"} icon={<PlacesIcon size={24}/>} index={at}/>
        {categories.slice(at).map((category, index) => (<CategoryCard key={category.id} category={category} index={at + 1 + index}/>))}
        <SiteSectionCard to="/church" title="Կարգեր և վարքեր" note="Արարողություններ, խորհուրդներ, վարվելակարգ" icon={<EtiquetteIcon size={24}/>} index={categories.length + 1}/>
    </ol>);
});

/** The home search box: suggestions as you type, results with the search button or Enter. */
function HomeSearch() {
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const [value, setValue] = useState("");
    const [error, setError] = useState<string | null>(null);
    // Searching starts with the button, Enter or a suggestion (every search costs the server).
    const go = (query: string) => {
        const trimmed = query.trim();
        const message = searchValidation(trimmed);
        setError(message);
        if (!message) navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    };
    return (<div><Form className="hero-rise hero-rise-delay-2 relative z-30 mt-3 mb-1 flex min-h-[52px] w-full items-center gap-[10px] search-field pr-[6px] pl-[14px]" action="/search" method="get" role="search" onSubmit={(event) => { event.preventDefault(); go(value); }}>
        <Search aria-hidden="true" size={19} strokeWidth={1.9}/>
        <SearchSuggestions inputRef={inputRef} onPick={go}/>
        <input ref={inputRef} className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint" type="search" name="q" placeholder="Փնտրել աղոթք, սաղմոս, սուրբ…" aria-label="Որոնել գրադարանում" autoComplete="off" maxLength={120} enterKeyHint="search"
            value={value} onChange={(event) => setValue(event.target.value)}/>
        <button className="search-go" type="submit" aria-label="Որոնել">
            <ArrowRight aria-hidden="true" size={18}/>
        </button>
    </Form>{error ? <p role="alert" className="mt-2 text-sm search-validation-error">{error}</p> : null}</div>);
}

export default function Home({loaderData}: Route.ComponentProps) {
    return (<PageShell width="library">
        <div className="relative mt-[10px] w-full pt-[12px] min-[560px]:mt-[16px] min-[560px]:pt-[20px]">
            <div className="absolute top-[12px] -left-[4%] z-4 w-[25%] min-[560px]:top-[20px]">
                <img className="reveal-img block h-auto w-full" src={AngelLeft} srcSet={ANGEL_SRCSET} sizes={ANGEL_SIZES} alt="" width={540} height={728} decoding="async" fetchPriority="low"/>
            </div>
            <ArtImage
                className="relative z-1 block h-auto w-full"
                src={LastSupperImg}
                sizes="(max-width: 1100px) calc(100vw - 28px), 1100px"
                alt="Խորհրդավոր ընթրիքը"
                width={1774}
                height={887}
                fetchPriority="high"
                decoding="async"
            />
            <div className="absolute top-[12px] -right-[4%] z-4 w-[25%] scale-x-[-1] min-[560px]:top-[20px]">
                <img className="reveal-img block h-auto w-full" src={AngelLeft} srcSet={ANGEL_SRCSET} sizes={ANGEL_SIZES} alt="" width={540} height={728} decoding="async" fetchPriority="low"/>
            </div>
        </div>
        <HomeTitle/>
        <TodayLine today={loaderData.today}/>
        <div className="hero-rise hero-rise-delay-2 mt-1"><DailyVerseCard/></div>
        <HomeSearch/>
        <section className="mt-4 grid gap-3" aria-labelledby="categories-title">
            <h2 className="m-0 flex items-center gap-3 px-1 text-[12px] font-semibold tracking-[1.6px] text-gold uppercase" id="categories-title">
                Բաժիններ
                <span className="h-px flex-1 bg-[linear-gradient(90deg,rgb(217_181_111/45%),transparent)]" aria-hidden="true"/>
            </h2>
            <CategoryGrid categories={loaderData.categories} places={loaderData.places}/>
        </section>
        <SiteNav/>
    </PageShell>);
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
