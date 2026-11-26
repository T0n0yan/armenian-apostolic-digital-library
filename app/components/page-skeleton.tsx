import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, ChevronLeft, ChevronRight, CirclePlay, Filter, LocateFixed, Plus, Search, Send, Share2, SlidersHorizontal } from "lucide-react";
import { useRouteLoaderData } from "react-router";

import divider2 from "../assets/divider2.webp";
import { CONTENT_CATEGORIES, resolveContentCategoryId } from "../../shared/telegram-bridge-contract";
import { SECTION_SLUGS, currentSection } from "../utils/material-path";
import { ArmeniaOutline } from "./armenia-outline";
import { ArtImage } from "./art-image";
import { SECTION_INTROS, SectionIntro } from "./category-cards";
import { CategoryIcon } from "./category-icon";
import { DailyVerseCard } from "./daily-verse";
import { HomeTitle } from "./home-title";
import { PageHeader } from "./page-layout";
import { MY_CORNER_IMAGE, getCategoryImage } from "./section-header";
import { PlacesIcon } from "./topic-icons";
import angelLeft from "../assets/angel-left.webp";
import lastSupper from "../assets/last-supper.webp";

/**
 * Բացվող էջի կմախքը, մինչև էջը գա։ Ամեն էջ ունի իրենը՝ նույն նկարները, վերնագրերը, կոճակները և
 * վահանակները, ինչ իրական էջում, իսկ տեքստի ու նկարների տեղերում՝ փայլող ոսկեգույն ձևեր։
 * Ինչ նախօրոք հայտնի է (բաժնի անունը, սաղմոսի համարը, ստատիկ տեքստերը), գրվում է իսկական տեքստով։
 */
type Section = "psalms" | "pray" | "saints" | "gospel" | "daily" | "questions" | "other";
type Kind =
  | { page: "home" | "search" | "saved" | "places" | "place" | "help" | "year" | "plain" }
  | { page: "section"; section: Section }
  | { page: "material"; section: Section; psalm: number | null }
  | { page: "verse"; psalm: number; verse: number };

const SECTION_CATEGORY = new Map(Object.entries(SECTION_SLUGS).map(([id, slug]) => [slug, id]));
/** Բաժինների անունները, ինչպես գրված են կայքում (գլխավոր էջի տվյալները, եթե կան, գերակա են)։ */
const SECTION_NAMES: Record<string, string> = {
  category_psalms: "Սաղմոսներ",
  category_prayers: "Աղոթքներ",
  category_saints_lives: "Սրբերի վարքը",
  category_gospel_teachings: "Ավետարանի ուսուցում",
  category_daily_readings: "Օրվա ընթերցումներ",
  category_bible_questions: "Հարցեր Աստվածաշնչից",
};
/** Գլխավոր էջի բաժինների կարգը (Սրբավայրերը՝ Սաղմոսներից հետո)։ */
const HOME_ORDER = ["category_gospel_teachings", "category_prayers", "category_psalms", "places", "category_saints_lives", "category_daily_readings", "category_bible_questions"];

function sectionOf(slug: string): Section {
  const current = currentSection(slug);
  return SECTION_CATEGORY.has(current) ? current as Section : "other";
}

function number(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function kindOf(pathname: string): Kind {
  const parts = pathname.split("/").filter(Boolean);
  const [first = "", second, third] = parts;
  if (!parts.length) return { page: "home" };
  if (first === "search") return { page: "search" };
  if (first === "saved" || first === "notes") return { page: "saved" };
  if (first === "my-year") return { page: "year" };
  if (first === "ognutyun") return { page: "help" };
  if (first === "places") return { page: parts.length > 1 && second !== "new" ? "place" : parts.length > 1 ? "plain" : "places" };
  if (["admin", "namak", "auth", "settings", "mer-masin", "kap", "privacy", "church-3d"].includes(first)) return { page: "plain" };
  if (first === "materials") return { page: "material", section: "other", psalm: null };
  if (first === "categories") return { page: "section", section: "other" };
  const section = sectionOf(first);
  if (parts.length === 1) return { page: "section", section };
  if (parts.length === 2) return { page: "material", section, psalm: section === "psalms" ? number(second) : null };
  const psalm = number(second);
  const verse = number(third);
  return section === "psalms" && psalm && verse ? { page: "verse", psalm, verse } : { page: "material", section, psalm: null };
}

/** Մեկ փայլող ձև։ */
function Bone({ className = "" }: { className?: string }) {
  return <span className={`page-bone block ${className}`} />;
}

function repeat(count: number, draw: (index: number) => ReactNode) {
  return Array.from({ length: count }, (_, index) => draw(index));
}

/** Տեքստի տողեր, վերջինը՝ կարճ։ */
function Lines({ count, className = "h-3.5", gap = "gap-2.5", last = "w-3/5", center = false }: { count: number; className?: string; gap?: string; last?: string; center?: boolean }) {
  return (
    <span className={`grid w-full ${gap} ${center ? "justify-items-center" : ""}`}>
      {repeat(count, (index) => <Bone key={index} className={`${className} rounded-full ${index === count - 1 ? last : "w-full"}`} />)}
    </span>
  );
}

/** Անկյունի կլոր որոնման կոճակը, ինչպես ExpandingSearch-ը փակ վիճակում։ */
function SearchCircle() {
  return (
    <span className="header-search">
      <span className="hs-toggle"><Search aria-hidden="true" size={17} strokeWidth={2} /></span>
    </span>
  );
}

/** Բաժնի գլուխը՝ ինչպես SectionHeader-ը. «← Բաժիններ», որոնման կոճակ, նկար, անուն, զարդ։ */
function SectionTop({ image, title, backLabel = "Բաժիններ" }: { image: string; title: string; backLabel?: string }) {
  return (
    <div className="mb-[14px] grid gap-[10px] min-[768px]:mb-[18px] min-[768px]:gap-[14px]">
      <span className="relative flex min-h-11 items-center gap-2">
        <span className="inline-flex min-h-[32px] items-center gap-[7px] text-[13px] font-bold text-gold-bright"><ArrowLeft aria-hidden="true" size={17} strokeWidth={2} />{backLabel}</span>
        <SearchCircle />
      </span>
      <div className="grid items-center gap-[10px]">
        <div className="flex min-h-[160px] w-full items-center justify-center min-[390px]:min-h-[180px] min-[768px]:h-full">
          <ArtImage className="block h-full w-full object-cover" src={image} width={1774} height={887} decoding="async" alt="" />
        </div>
        <div className="grid justify-items-center gap-[9px] text-center">
          <p className="page-skeleton-title m-0 w-full font-noto text-[26px] leading-[32px] font-medium tracking-[-0.4px] text-balance text-ink min-[390px]:text-[28px] min-[390px]:leading-[34px] min-[768px]:text-[34px] min-[768px]:leading-[40px] min-[960px]:text-[40px] min-[960px]:leading-[46px]">{title}</p>
          <img src={divider2} alt="" width={1200} height={126} decoding="async" className="h-[40px] w-full object-contain" />
        </div>
      </div>
    </div>
  );
}

/** Ոսկե խաչը երկու մարող գծերի միջև (IntroOrnament)։ */
function Ornament() {
  return (
    <span className="flex items-center justify-center gap-2.5 text-gold">
      <span className="h-px w-16 bg-[linear-gradient(90deg,transparent,currentColor)]" />
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M5.2 0h1.6v4.4H11V6H6.8v6H5.2V6H1V4.4h4.2Z" /></svg>
      <span className="h-px w-16 bg-[linear-gradient(90deg,currentColor,transparent)]" />
    </span>
  );
}

/** Telegram-ից եկող ներածություն (TopicIntro). տեքստը նախօրոք հայտնի չէ, ձևը՝ այո։ */
function TopicIntroBones({ section }: { section: Section }) {
  const body = section === "pray"
    // Մեջբերում՝ աղոթագրքի տառով, ներքևում հեղինակը։
    ? <><Lines count={7} className="h-4" gap="gap-[14px]" last="w-2/3" center /><Bone className="h-3 w-28 rounded-full" /></>
    : section === "questions"
      ? <><span className="grid w-full justify-items-center gap-2"><Bone className="h-4 w-11/12 rounded-full" /><Bone className="h-4 w-3/5 rounded-full" /></span><Lines count={9} className="h-3" gap="gap-[11px]" last="w-1/2" center /></>
      : section === "psalms"
        // Միայն վերնագիր՝ «Դավթի սաղմոսների գիրքը»։
        ? <Bone className="h-4 w-1/2 rounded-full" />
        : <><Bone className="h-4 w-40 rounded-full" /><Lines count={3} className="h-3" last="w-1/2" center /></>;
  return (
    <div className="mb-4 grid gap-2.5">
      <Ornament />
      <div className="paper-panel grid justify-items-center gap-3 px-5 py-5">{body}</div>
      <Ornament />
    </div>
  );
}

/** «Նյութեր» և քանակը աջում։ */
function ListHeading() {
  return (
    <span className="flex items-center justify-between gap-2.5 px-1">
      <span className="text-[12px] font-semibold tracking-[1.6px] text-gold uppercase">Նյութեր</span>
      <Bone className="h-3 w-6 rounded-full" />
    </span>
  );
}

function Chips({ widths }: { widths: string[] }) {
  return (
    <span className="-mx-1 flex gap-2 overflow-hidden px-1">
      {widths.map((width, index) => <Bone key={index} className={`h-9 shrink-0 rounded-full ${width}`} />)}
    </span>
  );
}

const twoColumns = "m-0 grid list-none gap-2.5 p-0 min-[860px]:grid-cols-2";

function SectionBody({ section }: { section: Section }) {
  switch (section) {
    case "psalms":
      // Բոլոր 150 համարները, ինչպես էջում (համարները հայտնի են, միայն բեռնված չեն)։
      return (
        <div className="grid gap-2">
          <Bone className="ml-1 h-3 w-28 rounded-full" />
          <ol className="m-0 grid list-none grid-cols-6 gap-1.5 p-0 min-[420px]:grid-cols-7 min-[640px]:grid-cols-10 min-[960px]:grid-cols-12">
            {repeat(60, (index) => (
              <li key={index} className="paper-card grid aspect-square place-items-center rounded-control">
                <span className="font-noto text-[16px] font-semibold text-gold-bright/45 tabular-nums min-[640px]:text-[18px]">{index + 1}</span>
              </li>
            ))}
          </ol>
        </div>
      );
    case "saints":
      // Սրբի նկարը ամբողջ քարտով, անունը ներքևում։
      return (
        <ol className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 min-[720px]:grid-cols-3">
          {repeat(6, (index) => (
            <li key={index} className="relative aspect-[3/4] overflow-hidden rounded-card border border-edge bg-[rgb(217_181_111/6%)] shadow-card">
              <Bone className="absolute inset-0 opacity-70" />
              <span className="absolute inset-x-0 bottom-0 grid justify-items-center gap-2 p-3">
                <span className="h-px w-10 bg-[rgb(217_181_111/70%)]" />
                <Bone className="h-3.5 w-4/5 rounded-full" />
                <Bone className="h-3.5 w-1/2 rounded-full" />
              </span>
            </li>
          ))}
        </ol>
      );
    case "gospel":
      // Տեսանյութի քարտ՝ մեծ նկար՝ կոճակով, տակը՝ վերնագիր։
      return (
        <ol className={twoColumns}>
          {repeat(4, (index) => (
            <li key={index} className="paper-card grid gap-[11px] p-[10px] pb-[14px]">
              <span className="relative grid aspect-video place-items-center overflow-hidden rounded-button border border-edge bg-[rgb(217_181_111/6%)]">
                <Bone className="absolute inset-0 opacity-60" />
                <span className="relative size-12 rounded-full bg-[rgb(60_40_20/22%)]" />
              </span>
              <span className="grid gap-2 px-1"><Bone className="h-4 w-4/5 rounded-full" /><Bone className="h-4 w-1/2 rounded-full" /></span>
            </li>
          ))}
        </ol>
      );
    case "daily":
      // Օրվա քարտ՝ մեծ նկար վերևում, տակը՝ օրը ոսկե շրջանակում և տոնի անունը։
      return (
        <ol className="m-0 grid list-none gap-3 p-0 min-[860px]:grid-cols-2">
          {repeat(3, (index) => (
            <li key={index} className="paper-card grid overflow-hidden p-0">
              <Bone className="aspect-[16/9] w-full rounded-none opacity-70" />
              <span className="grid grid-cols-[78px_1fr] items-start gap-3.5 p-4">
                <span className="grid h-[68px] content-center justify-items-center gap-2 rounded-button border border-[rgb(217_181_111/40%)] bg-[rgb(217_181_111/8%)]">
                  <Bone className="h-6 w-8 rounded-chip" />
                  <Bone className="h-2 w-12 rounded-full" />
                </span>
                <span className="grid gap-2 pt-1"><Bone className="h-2.5 w-16 rounded-full" /><Bone className="h-4 w-11/12 rounded-full" /><Bone className="h-4 w-3/5 rounded-full" /></span>
              </span>
            </li>
          ))}
        </ol>
      );
    case "questions":
      // Համարակալված հարցեր՝ «?» շրջանակով և «Պատասխանել →»։
      return (
        <ol className={twoColumns}>
          {repeat(5, (index) => (
            <li key={index} className="paper-card grid grid-cols-[30px_1fr] items-start gap-2.5 px-[16px] py-[14px]">
              <span className="grid size-[30px] place-items-center rounded-full border border-[rgb(217_181_111/45%)] text-[14px] font-bold text-gold-bright/50">?</span>
              <span className="grid gap-2 pt-1"><Bone className="h-4 w-full rounded-full" /><Bone className="h-4 w-11/12 rounded-full" /><Bone className="h-4 w-2/5 rounded-full" /><Bone className="mt-1 h-3 w-24 rounded-full" /></span>
            </li>
          ))}
        </ol>
      );
    case "pray":
      // Խմբերի կոճակները, հետո ամեն խմբի անունն ու աղոթքները։
      return (
        <div className="grid gap-4">
          <Chips widths={["w-24", "w-28", "w-40", "w-28"]} />
          {repeat(2, (group) => (
            <div key={group} className="grid gap-2.5">
              <Bone className="ml-1 h-4 w-28 rounded-full" />
              <ol className={twoColumns}>{repeat(group ? 2 : 3, (index) => (
                <li key={index} className="paper-card grid gap-2.5 px-[16px] py-[14px]">
                  <Bone className="h-4 w-11/12 rounded-full" />
                  <Bone className="h-4 w-3/5 rounded-full" />
                </li>
              ))}</ol>
            </div>
          ))}
        </div>
      );
    default:
      return (
        <ol className={twoColumns}>
          {repeat(6, (index) => (
            <li key={index} className="paper-card grid min-h-[122px] grid-cols-[78px_minmax(0,1fr)] items-start gap-[13px] p-3 min-[560px]:grid-cols-[96px_minmax(0,1fr)]">
              <Bone className="aspect-[4/3] w-full rounded-control" />
              <span className="grid gap-2 pt-1"><Bone className="h-5 w-16 rounded-full" /><Bone className="h-4 w-11/12 rounded-full" /><Bone className="h-3 w-3/4 rounded-full" /></span>
            </li>
          ))}
        </ol>
      );
  }
}

function useSectionNames() {
  // Գլխավոր էջից բաժին գնալիս՝ նույն անունները, ինչ բազայում են։
  const home = useRouteLoaderData("routes/home") as { categories?: { id: string; name: string }[] } | undefined;
  const names = { ...SECTION_NAMES };
  for (const category of home?.categories ?? []) {
    const id = resolveContentCategoryId(category.id, category.name);
    if (id) names[id] = category.name;
  }
  return names;
}

function SectionPage({ section, names }: { section: Section; names: Record<string, string> }) {
  const category = SECTION_CATEGORY.get(section) ?? "";
  const intro = SECTION_INTROS[category];
  return (
    <>
      <SectionTop image={getCategoryImage(category, null)} title={names[category] ?? ""} />
      {intro ? <div className="mb-4"><SectionIntro {...intro} /></div> : <TopicIntroBones section={section} />}
      <div className="grid gap-[11px]">
        <ListHeading />
        <SectionBody section={section} />
      </div>
    </>
  );
}

/** Ընթերցման վահանակ, ինչպես `.reading-body`-ն։ */
const reading = "paper-panel grid gap-3 px-4 py-5 shadow-card min-[560px]:px-7 min-[560px]:py-7";

/** Սաղմոսի նվագարկիչը՝ ‹ Սաղմոս N ›, սահիչը և երեք կոճակները։ */
function PsalmPlayer({ psalm }: { psalm: number | null }) {
  const round = "grid size-11 place-items-center rounded-full border border-edge bg-subtle text-gold-bright/60";
  return (
    <div className="paper-panel grid gap-3 px-4 py-4 shadow-card">
      <span className="grid grid-cols-[44px_1fr_44px] items-center">
        <span className={round}><ChevronLeft aria-hidden="true" size={20} /></span>
        <span className="grid justify-items-center gap-1">
          {psalm ? <span className="font-noto text-[20px] leading-tight font-semibold text-gold-bright">Սաղմոս {psalm}</span> : <Bone className="h-5 w-28 rounded-full" />}
          <Bone className="h-2.5 w-8 rounded-full" />
        </span>
        <span className={round}><ChevronRight aria-hidden="true" size={20} /></span>
      </span>
      <span className="grid gap-2 pt-2">
        <Bone className="h-1.5 w-full rounded-full" />
        <span className="flex justify-between"><Bone className="h-2.5 w-7 rounded-full" /><Bone className="h-2.5 w-8 rounded-full" /></span>
      </span>
      <span className="flex items-center justify-center gap-10 pb-1">
        <Bone className="size-6 rounded-full" />
        <span className="size-[60px] rounded-full bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] opacity-60 shadow-card" />
        <Bone className="size-6 rounded-full" />
      </span>
    </div>
  );
}

function MaterialBody({ section, psalm }: { section: Section; psalm: number | null }) {
  switch (section) {
    case "psalms":
      // Նվագարկիչը, հետո մակագրությունը և համարակալված տողերը։
      return (
        <>
          <PsalmPlayer psalm={psalm} />
          <div className={reading}>
            <span className="grid justify-items-center border-b border-[rgb(217_181_111/32%)] pt-1 pb-4"><Bone className="h-4 w-48 rounded-full" /></span>
            {repeat(5, (verse) => <span key={verse} className="pt-1"><Lines count={verse % 2 ? 3 : 2} className="h-4" gap="gap-[14px]" last={verse % 2 ? "w-2/5" : "w-3/5"} /></span>)}
          </div>
        </>
      );
    case "pray":
      // Աղոթքը՝ մեկ վահանակում, կենտրոնացված տողերով։
      return (
        <div className={reading}>
          <Lines count={4} className="h-4" gap="gap-[18px]" last="w-2/3" />
          <span className="grid justify-items-center gap-[18px] pt-1">{["w-3/4", "w-1/2", "w-3/5", "w-2/3", "w-1/2", "w-3/4", "w-2/5", "w-3/5", "w-1/2", "w-2/3"].map((width, index) => <Bone key={index} className={`h-4 rounded-full ${width}`} />)}</span>
        </div>
      );
    case "saints":
      // Սրբի նկարը, ստորագրությունը, վերնագիրը և վարքը՝ նույն վահանակում։
      return (
        <div className={reading}>
          <Bone className="aspect-[4/3] w-full rounded-card opacity-80" />
          <Lines count={2} className="h-3" last="w-3/4" />
          <Bone className="mt-2 h-5 w-4/5 rounded-full" />
          <span className="my-1 h-px w-full bg-[rgb(217_181_111/32%)]" />
          <Lines count={8} className="h-4" gap="gap-[14px]" />
        </div>
      );
    case "gospel":
      // Տեսանյութը, հետո ժամանակով նշված հարցերը։
      return (
        <>
          <span className="relative grid aspect-video place-items-center overflow-hidden rounded-card bg-[rgb(40_26_14/55%)] shadow-card">
            <span className="size-14 rounded-full bg-[rgb(255_255_255/14%)]" />
          </span>
          <div className={reading}>
            <Bone className="h-4 w-4/5 rounded-full" />
            {repeat(4, (index) => (
              <span key={index} className="grid grid-cols-[46px_1fr] items-start gap-2.5 pt-1">
                <Bone className="h-6 w-[46px] rounded-control" />
                <Lines count={index % 2 ? 2 : 3} className="h-4" gap="gap-[14px]" />
              </span>
            ))}
          </div>
        </>
      );
    case "daily":
      // Օրվա նկարը, տոնը, ընթերցումների ցանկը և առաջին ընթերցումը։
      return (
        <div className={reading}>
          <Bone className="aspect-[2/1] w-full rounded-card opacity-80" />
          <Lines count={3} className="h-4" last="w-1/2" />
          <Bone className="mt-2 h-5 w-3/4 rounded-full" />
          <span className="grid gap-3 pl-5">{["w-3/4", "w-1/2", "w-3/5", "w-4/5"].map((width) => <Bone key={width} className={`h-4 rounded-full ${width}`} />)}</span>
          <Bone className="mt-2 h-5 w-2/3 rounded-full" />
          <span className="border-l-2 border-[rgb(217_181_111/35%)] pl-4"><Lines count={5} className="h-4" gap="gap-[14px]" /></span>
        </div>
      );
    case "questions":
      // Պատասխանի տարբերակները մեկ վահանակում, տակը՝ «Կիսվել»։
      return (
        <>
          <div className="paper-panel grid gap-3 p-4 shadow-card">
            <span className="grid grid-cols-[22px_1fr] items-start gap-2.5">
              <Bone className="size-5 rounded-chip" />
              <span className="grid gap-2"><Bone className="h-3.5 w-24 rounded-full" /><Bone className="h-2.5 w-44 rounded-full" /></span>
            </span>
            {repeat(4, (index) => <span key={index} className="flex min-h-[44px] items-center rounded-button border border-edge bg-control px-4"><Bone className={`h-3.5 rounded-full ${["w-24", "w-28", "w-20", "w-24"][index]}`} /></span>)}
          </div>
          <span className="paper-panel grid min-h-[52px] place-items-center gap-1 py-2.5 text-gold-bright/60"><Share2 aria-hidden="true" size={16} /><Bone className="h-2.5 w-12 rounded-full" /></span>
        </>
      );
    default:
      return <div className={reading}><Lines count={9} className="h-4" gap="gap-[14px]" /></div>;
  }
}

function Home() {
  const order = HOME_ORDER.map((id) => id === "places" ? { id, name: "Սրբավայրեր" } : CONTENT_CATEGORIES.find((category) => category.id === id)!);
  return (
    <>
      <div className="relative mt-[10px] w-full pt-[12px] min-[560px]:mt-[16px] min-[560px]:pt-[20px]">
        <img className="absolute top-[12px] -left-[10px] z-4 block h-auto w-[27%] min-[560px]:top-[20px]" src={angelLeft} alt="" width={540} height={728} />
        <ArtImage className="relative z-1 block h-auto w-full" src={lastSupper} sizes="(max-width: 1100px) calc(100vw - 28px), 1100px" alt="" width={1774} height={887} />
        <img className="absolute top-[12px] -right-[10px] z-4 block h-auto w-[27%] scale-x-[-1] min-[560px]:top-[20px]" src={angelLeft} alt="" width={540} height={728} />
      </div>
      <HomeTitle />
      <div className="mt-2"><DailyVerseCard /></div>
      <span className="search-field mt-3 mb-1 flex min-h-[52px] w-full items-center gap-[10px] pr-[6px] pl-[14px]">
        <Search aria-hidden="true" size={19} strokeWidth={1.9} />
        <span className="min-w-0 flex-1 truncate text-[16px] text-faint">Փնտրել աղոթք, սաղմոս, սուրբ…</span>
        <span className="search-go"><ArrowRight aria-hidden="true" size={18} /></span>
      </span>
      <div className="mt-4 grid gap-3">
        <span className="m-0 flex items-center gap-3 px-1 text-[12px] font-semibold tracking-[1.6px] text-gold uppercase">Բաժիններ<span className="h-px flex-1 bg-[linear-gradient(90deg,rgb(217_181_111/45%),transparent)]" /></span>
        <ol className="m-0 grid list-none gap-2.5 p-0 min-[560px]:grid-cols-2 min-[960px]:grid-cols-3">
          {order.map((category) => (
            <li key={category.id} className="paper-card relative flex min-h-[76px] items-center gap-[14px] px-3.5 py-3 min-[560px]:min-h-[88px] min-[560px]:p-[16px]">
              <span className="grid size-[42px] shrink-0 place-items-center rounded-full border border-[rgb(217_181_111/38%)] text-gold-bright">
                {category.id === "places" ? <PlacesIcon size={24} /> : <CategoryIcon categoryId={category.id} categoryName={category.name} size={24} />}
              </span>
              <span className="grid min-w-0 flex-1 gap-1.5">
                <strong className="font-noto text-[16px] leading-[22px] font-semibold min-[960px]:text-[17px] min-[960px]:leading-[23px]">{SECTION_NAMES[category.id] ?? category.name}</strong>
                <Bone className="h-2.5 w-16 rounded-full" />
              </span>
              <span className="mr-2 text-gold"><ArrowRight size={18} strokeWidth={1.8} /></span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

/** «Իմ անկյունը»՝ մուտք գործածի և չգործածի համար տարբեր։ */
function Saved({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <SectionTop image={MY_CORNER_IMAGE} title="Իմ անկյունը" backLabel="Գրադարան" />
      {signedIn ? (
        <div className="paper-panel grid gap-3 p-4">
          <span className="flex items-center justify-between"><span className="grid gap-2"><Bone className="h-4 w-40 rounded-full" /><Bone className="h-3 w-24 rounded-full" /></span><Bone className="h-8 w-14 rounded-full" /></span>
          <Bone className="h-14 w-full rounded-button opacity-70" />
          <span className="grid grid-cols-7 gap-1.5">{repeat(28, (index) => <span key={index} className="page-bone aspect-square rounded-control" />)}</span>
        </div>
      ) : (
        <div className="paper-panel grid justify-items-center gap-3 px-5 py-6">
          <Bone className="size-11 rounded-full" />
          <Bone className="h-4 w-40 rounded-full" />
          <Lines count={3} className="h-3" last="w-1/2" center />
          <Bone className="mt-2 h-11 w-full rounded-button" />
          <Bone className="h-11 w-full rounded-button" />
          <Bone className="mt-2 h-3.5 w-52 rounded-full" />
        </div>
      )}
    </>
  );
}

function Content({ kind, names, signedIn, searching }: { kind: Kind; names: Record<string, string>; signedIn: boolean; searching: boolean }) {
  switch (kind.page) {
    case "home":
      return <Home />;
    case "section":
      return <SectionPage section={kind.section} names={names} />;
    case "material": {
      const category = SECTION_CATEGORY.get(kind.section);
      const title = kind.section === "questions"
        // Հարցի էջի վերնագիրը հենց հարցն է՝ երկու-երեք տող։
        ? <span className="grid justify-items-center gap-2 pt-1"><Bone className="h-5 w-11/12 rounded-full" /><Bone className="h-5 w-4/5 rounded-full" /><Bone className="h-5 w-1/2 rounded-full" /></span>
        : <Bone className="mx-auto mt-1 h-[22px] w-3/5 max-w-[360px] rounded-full min-[560px]:h-[28px]" />;
      return (
        <>
          <PageHeader showSearch={false} backTo="/" backLabel={category ? names[category] : <Bone className="h-3.5 w-24 rounded-full" />} title={title} />
          <div className="mt-3 grid gap-4 min-[560px]:mt-4"><MaterialBody section={kind.section} psalm={kind.psalm} /></div>
        </>
      );
    }
    case "verse":
      // Սաղմոսի համարը. վերնագիրը և կոճակների համարները հայտնի են։
      return (
        <>
          <PageHeader showSearch={false} backTo="/" backLabel={<Bone className="h-3.5 w-32 rounded-full" />} title={`Սաղմոս ${kind.psalm}:${kind.verse}`} />
          <div className="mt-4 grid gap-4">
            <div className="paper-panel grid justify-items-center gap-3 px-5 py-8 shadow-card min-[560px]:px-9 min-[560px]:py-10">
              <span className="mb-1 text-[13px] font-bold tracking-[0.04em] text-gold">Սաղմոս {kind.psalm}:{kind.verse}</span>
              <Lines count={3} className="h-5" gap="gap-[16px]" last="w-2/3" center />
            </div>
            <span className="flex min-h-12 items-center justify-center gap-2 rounded-button bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] px-4 text-[15px] font-bold text-[#2a1708] shadow-card"><BookOpen aria-hidden="true" size={18} /> Կարդալ ամբողջ սաղմոսը</span>
            <span className="flex items-center justify-between gap-2 text-[13px] font-bold text-gold-bright">
              <span className={`inline-flex min-h-10 items-center gap-1 rounded-full border border-edge bg-subtle px-3.5 ${kind.verse > 1 ? "" : "invisible"}`}><ChevronLeft aria-hidden="true" size={16} />{kind.verse - 1}</span>
              <span className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-edge bg-subtle px-3.5"><Share2 aria-hidden="true" size={16} />Կիսվել</span>
              <span className="inline-flex min-h-10 items-center gap-1 rounded-full border border-edge bg-subtle px-3.5">{kind.verse + 1}<ChevronRight aria-hidden="true" size={16} /></span>
            </span>
          </div>
        </>
      );
    case "search":
      return (
        <>
          <PageHeader backTo="/" backLabel="Գրադարան" showSearch={false} title="Որոնում" eyebrow="Ամբողջ գրադարանը" description="Աղոթքներ, սաղմոսներ, սրբերի վարքեր, ընթերցումներ և հարցեր՝ մեկ տեղում։" />
          <div className="paper-panel mt-1 grid gap-3 p-3">
            <span className="search-field flex min-h-[52px] items-center gap-3 px-3"><Search aria-hidden="true" size={19} />{searching ? <Bone className="h-3.5 w-1/3 rounded-full" /> : <span className="truncate text-[16px] text-faint">Օրինակ՝ առակ, Սուրբ Մարիամ, աղոթք…</span>}</span>
            <span className="flex min-h-11 items-center gap-2.5 rounded-button border border-edge bg-subtle px-3.5 text-[13px] font-semibold text-gold-bright"><Filter aria-hidden="true" size={16} />Զտել արդյունքները<ChevronDown aria-hidden="true" size={17} className="ml-auto" /></span>
          </div>
          {searching ? (
            // Արդյունքների ցանկը՝ ինչպես MaterialListSkeleton-ը։
            <div className="mt-4 grid gap-2.5">
              <Bone className="ml-1 h-3 w-32 rounded-full" />
              {repeat(4, (index) => (
                <span key={index} className="paper-card grid min-h-[122px] grid-cols-[78px_minmax(0,1fr)] items-start gap-3 p-3 min-[560px]:grid-cols-[96px_minmax(0,1fr)]">
                  <Bone className="aspect-[4/3] w-full rounded-control" />
                  <span className="grid gap-2 pt-1"><Bone className="h-5 w-1/3 rounded-full" /><Bone className="h-4 w-4/5 rounded-full" /><Bone className="h-3 w-2/3 rounded-full" /></span>
                </span>
              ))}
            </div>
          ) : (
            <div className="paper-panel mt-4 grid gap-2 p-5 text-left">
              <Search aria-hidden="true" size={26} strokeWidth={1.6} className="text-gold-bright" />
              <strong className="font-noto text-[16px] text-ink">Գրիր այն, ինչ փնտրում ես</strong>
              <span className="text-[13px] text-muted">Կարող ես որոնել նաև բաժնով, ամսաթվով կամ Telegram հղումով։</span>
            </div>
          )}
        </>
      );
    case "saved":
      return <Saved signedIn={signedIn} />;
    case "year":
      return (
        <>
          <PageHeader backTo="/saved" backLabel="Իմ անկյունը" showSearch={false} title={<Bone className="mx-auto h-[26px] w-36 rounded-full" />} />
          <Bone className="mx-auto mt-1 mb-4 h-3.5 w-48 rounded-full" />
          <div className="grid gap-4">{repeat(3, (index) => (
            <div key={index} className="paper-panel grid gap-3 p-4">
              <Bone className="h-4 w-40 rounded-full" />
              <span className="grid grid-cols-2 gap-2">{repeat(2, (cell) => <span key={cell} className="grid justify-items-center gap-2 rounded-button bg-subtle p-3"><Bone className="h-6 w-10 rounded-full" /><Bone className="h-2.5 w-20 rounded-full" /></span>)}</span>
            </div>
          ))}</div>
        </>
      );
    case "help":
      return (
        <>
          <PageHeader showSearch={false} backTo="/" backLabel="Գրադարան" title="Օգնություն" />
          <p className="mx-auto mt-2 mb-4 max-w-[34rem] text-center text-[14.5px] leading-relaxed text-muted">Կարճ տեսանյութեր՝ ինչպես օգտվել կայքից։ Սեղմեք վերնագրի վրա, և տեսանյութը կբացվի։</p>
          <ol className="m-0 grid list-none gap-2.5 p-0 min-[760px]:grid-cols-2">
            {repeat(10, (index) => (
              <li key={index} className="paper-card flex min-h-[60px] items-center gap-3 px-3 py-2.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#f1d79c,#c99a4b_60%,#a87a32)] text-[15px] font-bold text-[#2a1708] tabular-nums">{index + 1}</span>
                <Bone className={`h-4 rounded-full ${index % 3 === 1 ? "w-3/5" : "w-2/5"}`} />
                <CirclePlay aria-hidden="true" size={24} className="ml-auto shrink-0 text-gold-bright/50" />
              </li>
            ))}
          </ol>
        </>
      );
    case "places":
      return (
        <>
          <PageHeader backTo="/" backLabel="Գրադարան" title="Սրբավայրեր" />
          <p className="mx-auto mt-2 mb-4 max-w-[620px] text-center text-[14px] leading-relaxed text-muted">Հայաստանի վանքերն ու եկեղեցիները քարտեզի վրա։ Հպեք եկեղեցուն՝ տեղեկության և ճանապարհի համար։</p>
          <div className="mx-auto mb-3 grid w-full max-w-[560px] gap-2">
            <span className="flex items-stretch gap-2">
              <span className="paper-card grid min-h-[52px] flex-1 place-items-center gap-1 p-1.5"><Bone className="h-4 w-10 rounded-full" /><Bone className="h-2.5 w-28 rounded-full" /></span>
              <span className="paper-card grid w-14 shrink-0 place-items-center text-gold-bright/60"><SlidersHorizontal aria-hidden="true" size={18} /></span>
            </span>
            <span className="paper-card flex min-h-12 items-center justify-center gap-2 px-4 text-[14px] font-semibold text-gold-bright/70"><LocateFixed aria-hidden="true" size={18} />Իմ մոտակայքում</span>
          </div>
          <span className="block aspect-[1/0.92] max-h-[min(78svh,720px)] min-h-[320px] w-full p-[14px] min-[860px]:aspect-auto min-[860px]:h-[min(72svh,560px)]"><ArmeniaOutline /></span>
          <span className="mx-auto mt-4 flex flex-wrap justify-center gap-2 text-[13.5px]">
            <span className="flex items-center gap-2 rounded-button bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] px-4 py-2.5 font-bold text-[#2a1708] opacity-70"><Plus aria-hidden="true" size={16} strokeWidth={2.4} /> Ավելացնել սրբավայր</span>
            <span className="flex items-center gap-2 rounded-button border border-[rgb(217_181_111/35%)] bg-[rgb(217_181_111/10%)] px-4 py-2.5 font-semibold text-gold-bright/70"><Send aria-hidden="true" size={16} /> Բոտի միջոցով</span>
          </span>
          <div className="mt-5 grid grid-cols-2 gap-2"><span className="paper-card col-span-2 flex h-14 items-center justify-between px-4"><Bone className="h-4 w-20 rounded-full" /><Bone className="h-3 w-8 rounded-full" /></span>{repeat(6, (index) => <span key={index} className="paper-card flex h-14 items-center justify-between px-4"><Bone className="h-4 w-20 rounded-full" /><Bone className="h-3 w-6 rounded-full" /></span>)}</div>
        </>
      );
    case "place":
      return (
        <>
          <PageHeader backTo="/places" backLabel="Սրբավայրեր" title={<Bone className="mx-auto h-[26px] w-52 rounded-full" />}
            action={<span className="grid size-10 place-items-center rounded-full border border-edge bg-subtle text-gold-bright/60"><Share2 aria-hidden="true" size={17} /></span>} />
          <Bone className="mx-auto mt-1 mb-4 h-3 w-48 rounded-full" />
          <div className="grid gap-4">
            <Bone className="mx-auto aspect-[4/3] w-full max-w-[720px] rounded-card" />
            <Bone className="mx-auto h-11 w-full max-w-[420px] rounded-button opacity-70" />
            {repeat(2, (index) => <div key={index} className="paper-panel grid gap-3 p-5"><Bone className="h-4 w-32 rounded-full" /><Lines count={3} /></div>)}
          </div>
        </>
      );
    default:
      // Ադմին և այլ էջեր՝ ընդհանուր տեսք։
      return (
        <>
          <PageHeader backTo="/" backLabel={<Bone className="h-3.5 w-24 rounded-full" />} showSearch={false} title={<Bone className="mx-auto h-[26px] w-48 rounded-full" />} />
          <div className="mt-4 grid gap-3">{repeat(3, (index) => <div key={index} className="paper-panel grid gap-3 p-5"><Bone className="h-4 w-40 rounded-full" /><Lines count={3} /></div>)}</div>
        </>
      );
  }
}

export default function PageSkeleton({ pathname: target }: { pathname: string }) {
  const [pathname, query = ""] = target.split("?");
  const kind = kindOf(pathname);
  const searching = new URLSearchParams(query).has("q");
  const names = useSectionNames();
  const signedIn = Boolean((useRouteLoaderData("root") as { signedIn?: boolean } | undefined)?.signedIn);
  const wide = kind.page === "home";
  return (
    <div className="page-skeleton fixed inset-0 z-[2000] overflow-hidden" role="status" aria-label="Բեռնվում է…">
      <div className={`pointer-events-none mx-auto flex w-full flex-col ${wide ? "max-w-[1180px]" : "max-w-[940px]"} pt-[calc(var(--tg-inset-top,0px)+12px)] pr-[calc(var(--tg-inset-right,0px)+14px)] pl-[calc(var(--tg-inset-left,0px)+14px)] min-[560px]:pt-[calc(var(--tg-inset-top,0px)+20px)] min-[560px]:pr-[calc(var(--tg-inset-right,0px)+24px)] min-[560px]:pl-[calc(var(--tg-inset-left,0px)+24px)] min-[960px]:pr-[calc(var(--tg-inset-right,0px)+32px)] min-[960px]:pl-[calc(var(--tg-inset-left,0px)+32px)] min-[1440px]:pt-[calc(var(--tg-inset-top,0px)+26px)]`} aria-hidden="true" inert>
        <Content kind={kind} names={names} signedIn={signedIn} searching={searching} />
      </div>
    </div>
  );
}
