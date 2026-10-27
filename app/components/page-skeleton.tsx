import type { ReactNode } from "react";

import angelLeft from "../assets/angel-left.webp";
import divider2 from "../assets/divider2.webp";
import lastSupper from "../assets/last-supper.webp";
import { SECTION_SLUGS } from "../utils/material-path";
import { ArtImage } from "./art-image";
import { PageHeader } from "./page-layout";
import { MY_CORNER_IMAGE, getCategoryImage } from "./section-header";

/**
 * The outline of the page being opened, drawn while it loads. Each page and each section gets its
 * own: the same artwork, headings and frosted panels as the real page, and soft gold shapes that
 * shimmer where its text, tiles and pictures will be.
 */
type Section = "psalms" | "pray" | "saints" | "gospel" | "daily" | "questions" | "other";
type Kind =
  | { page: "home" | "search" | "saved" | "settings" | "places" | "place" | "admin" }
  | { page: "text"; title: string }
  | { page: "section" | "material"; section: Section }
  | { page: "verse" };

const SECTIONS = new Map(Object.entries(SECTION_SLUGS).map(([id, slug]) => [slug, id]));
const TEXT_PAGES: Record<string, string> = { "mer-masin": "Մեր մասին", kap: "Կապ", privacy: "Գաղտնիության քաղաքականություն" };

function sectionOf(slug: string): Section {
  return SECTIONS.has(slug) ? slug as Section : "other";
}

function kindOf(pathname: string): Kind {
  const parts = pathname.split("/").filter(Boolean);
  const [first = ""] = parts;
  if (!parts.length) return { page: "home" };
  if (first === "search" || first === "saved" || first === "settings" || first === "admin") return { page: first };
  if (first === "places") return { page: parts.length > 1 ? "place" : "places" };
  if (TEXT_PAGES[first]) return { page: "text", title: TEXT_PAGES[first] };
  if (first === "materials") return { page: "material", section: "other" };
  if (first === "categories") return { page: "section", section: "other" };
  if (parts.length === 1) return { page: "section", section: sectionOf(first) };
  return parts.length === 2 ? { page: "material", section: sectionOf(first) } : { page: "verse" };
}

/** One shimmering shape. */
function Bone({ className = "" }: { className?: string }) {
  return <span className={`page-bone block ${className}`} />;
}

function repeat(count: number, draw: (index: number) => ReactNode) {
  return Array.from({ length: count }, (_, index) => draw(index));
}

/** Lines of text, the last one shorter. */
function Lines({ count, className = "h-3.5", last = "w-3/5", center = false }: { count: number; className?: string; last?: string; center?: boolean }) {
  return (
    <span className={`grid w-full gap-2.5 ${center ? "justify-items-center" : ""}`}>
      {repeat(count, (index) => <Bone key={index} className={`${className} rounded-full ${index === count - 1 ? last : "w-full"}`} />)}
    </span>
  );
}

/** «← Back» as on PageHeader and SectionHeader. */
function BackRow({ search = false }: { search?: boolean }) {
  return (
    <span className="flex min-h-[32px] w-full items-center justify-between">
      <Bone className="h-3.5 w-28 rounded-full" />
      {search ? <Bone className="size-9 rounded-full" /> : null}
    </span>
  );
}

/** A section's head: its artwork, the title, the gold divider and the search box. */
function SectionTop({ image }: { image: string }) {
  return (
    <div className="mb-[14px] grid gap-[10px] min-[768px]:mb-[18px] min-[768px]:gap-[14px]">
      <BackRow />
      <div className="flex min-h-[160px] w-full items-center justify-center min-[390px]:min-h-[180px]">
        <ArtImage className="block h-full w-full object-cover" src={image} width={1774} height={887} decoding="async" alt="" />
      </div>
      <div className="grid justify-items-center gap-[9px]">
        <Bone className="my-[2px] h-[28px] w-52 rounded-[10px] min-[768px]:h-[36px] min-[768px]:w-72" />
        <img src={divider2} alt="" width={1200} height={126} decoding="async" className="h-[40px] w-full object-contain" />
        <SearchBox />
      </div>
    </div>
  );
}

function SearchBox() {
  return (
    <span className="flex min-h-[50px] w-full items-center gap-[10px] rounded-[16px] border border-glass-border bg-control px-[12px] shadow-card">
      <Bone className="size-[18px] rounded-full" />
      <Bone className="h-3.5 w-1/2 rounded-full" />
      <Bone className="ml-auto size-9 rounded-xl" />
    </span>
  );
}

/** The small gold cross between two fading rules that frames a section's intro. */
function Ornament() {
  return (
    <span className="flex items-center justify-center gap-2.5 text-gold opacity-80">
      <span className="h-px w-16 bg-[linear-gradient(90deg,transparent,currentColor)]" />
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M5.2 0h1.6v4.4H11V6H6.8v6H5.2V6H1V4.4h4.2Z" /></svg>
      <span className="h-px w-16 bg-[linear-gradient(90deg,currentColor,transparent)]" />
    </span>
  );
}

function Intro({ lines }: { lines: number }) {
  return (
    <div className="mb-4 grid gap-2.5">
      <Ornament />
      <div className="frosted-panel grid justify-items-center gap-3 px-5 py-5">
        <Bone className="h-4 w-40 rounded-full" />
        <span className="grid w-full max-w-[620px] justify-items-center gap-2.5">
          {repeat(lines, (index) => <Bone key={index} className={`h-3 rounded-full ${index === lines - 1 ? "w-1/2" : "w-full"}`} />)}
        </span>
      </div>
      <Ornament />
    </div>
  );
}

/** «Նյութեր» with its count on the right. */
function ListHeading() {
  return (
    <span className="flex items-center justify-between px-1">
      <Bone className="h-3 w-16 rounded-full" />
      <Bone className="size-6 rounded-full" />
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

/** A text card of the prayers and questions lists. */
function TextCard({ number = false }: { number?: boolean }) {
  return (
    <li className="frosted-card grid gap-2.5 px-[16px] py-[14px]">
      {number ? (
        <span className="grid grid-cols-[30px_1fr] items-start gap-2.5">
          <Bone className="size-[30px] rounded-full" />
          <span className="grid gap-2 pt-1"><Bone className="h-4 w-11/12 rounded-full" /><Bone className="h-4 w-3/5 rounded-full" /><Bone className="mt-1 h-3 w-24 rounded-full" /></span>
        </span>
      ) : (
        <>
          <Bone className="h-4 w-1/2 rounded-full" />
          <Bone className="h-3 w-full rounded-full" />
          <Bone className="h-3 w-4/5 rounded-full" />
        </>
      )}
    </li>
  );
}

const twoColumns = "m-0 grid list-none gap-2.5 p-0 min-[860px]:grid-cols-2";

function SectionBody({ section }: { section: Section }) {
  switch (section) {
    case "psalms":
      // Every psalm's number in a grid, as on the page.
      return (
        <div className="grid gap-2">
          <Bone className="ml-1 h-3 w-28 rounded-full" />
          <ol className="m-0 grid list-none grid-cols-6 gap-1.5 p-0 min-[420px]:grid-cols-7 min-[640px]:grid-cols-10 min-[960px]:grid-cols-12">
            {repeat(60, (index) => <li key={index} className="page-bone aspect-square rounded-[12px]" />)}
          </ol>
        </div>
      );
    case "saints":
      // Portraits with the name at the bottom.
      return (
        <ol className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 min-[720px]:grid-cols-3">
          {repeat(6, (index) => (
            <li key={index} className="relative aspect-[3/4] overflow-hidden rounded-[18px] border border-glass-border bg-[rgb(217_181_111/6%)]">
              <Bone className="absolute inset-0 opacity-60" />
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
      // Video cards: the poster with its play button, the title under it.
      return (
        <ol className={twoColumns}>
          {repeat(4, (index) => (
            <li key={index} className="frosted-card grid gap-[11px] p-[10px] pb-[14px]">
              <span className="relative grid aspect-video place-items-center overflow-hidden rounded-[14px] border border-glass-border bg-[rgb(217_181_111/6%)]">
                <Bone className="absolute inset-0 opacity-50" />
                <span className="relative size-12 rounded-full border border-[rgb(240_211_151/45%)] bg-[rgb(217_181_111/10%)]" />
              </span>
              <span className="grid gap-2 px-1"><Bone className="h-4 w-4/5 rounded-full" /><Bone className="h-3 w-full rounded-full" /></span>
            </li>
          ))}
        </ol>
      );
    case "daily":
      // Calendar leaves: the day in a gold box, the weekday and feast, the readings as pills.
      return (
        <ol className="m-0 grid list-none gap-3 p-0 min-[860px]:grid-cols-2">
          {repeat(4, (index) => (
            <li key={index} className="frosted-card grid gap-3 p-4">
              <span className="grid grid-cols-[78px_1fr] items-center gap-3.5">
                <span className="grid h-[68px] content-center justify-items-center gap-2 rounded-[16px] border border-[rgb(217_181_111/40%)] bg-[rgb(217_181_111/8%)]">
                  <Bone className="h-6 w-8 rounded-[8px]" />
                  <Bone className="h-2 w-12 rounded-full" />
                </span>
                <span className="grid gap-2"><Bone className="h-2.5 w-16 rounded-full" /><Bone className="h-4 w-4/5 rounded-full" /></span>
              </span>
              <span className="flex flex-wrap gap-1.5">{["w-24", "w-20", "w-[88px]"].map((width) => <Bone key={width} className={`h-6 rounded-full ${width}`} />)}</span>
            </li>
          ))}
        </ol>
      );
    case "questions":
      // How far the reader has come, the filter, then the numbered questions.
      return (
        <div className="grid gap-3">
          <div className="frosted-panel grid gap-2.5 px-4 py-3.5">
            <span className="flex justify-between"><Bone className="h-3.5 w-40 rounded-full" /><Bone className="h-3 w-12 rounded-full" /></span>
            <Bone className="h-2 w-full rounded-full" />
          </div>
          <Chips widths={["w-24", "w-32", "w-32"]} />
          <ol className={twoColumns}>{repeat(6, (index) => <TextCard key={index} number />)}</ol>
        </div>
      );
    case "pray":
      // Chips for the groups, then each group's heading and its prayers.
      return (
        <div className="grid gap-4">
          <Chips widths={["w-24", "w-28", "w-32", "w-28"]} />
          {repeat(2, (group) => (
            <div key={group} className="grid gap-2.5">
              <Bone className="ml-1 h-4 w-28 rounded-full" />
              <ol className={twoColumns}>{repeat(group ? 2 : 3, (index) => <TextCard key={index} />)}</ol>
            </div>
          ))}
        </div>
      );
    default:
      return (
        <ol className={twoColumns}>
          {repeat(6, (index) => (
            <li key={index} className="frosted-card grid min-h-[122px] grid-cols-[78px_minmax(0,1fr)] items-start gap-[13px] p-3 min-[560px]:grid-cols-[96px_minmax(0,1fr)]">
              <Bone className="aspect-[4/3] w-full rounded-[12px]" />
              <span className="grid gap-2 pt-1"><Bone className="h-5 w-16 rounded-full" /><Bone className="h-4 w-11/12 rounded-full" /><Bone className="h-3 w-3/4 rounded-full" /></span>
            </li>
          ))}
        </ol>
      );
  }
}

/** Intro length as the sections' own intros run: one or two lines, or a paragraph. */
const INTRO_LINES: Record<Section, number> = { psalms: 2, pray: 2, questions: 2, saints: 5, gospel: 5, daily: 4, other: 3 };

function SectionPage({ section }: { section: Section }) {
  return (
    <>
      <SectionTop image={getCategoryImage(SECTIONS.get(section) ?? "", null)} />
      <Intro lines={INTRO_LINES[section]} />
      <div className="grid gap-[11px]">
        <ListHeading />
        <SectionBody section={section} />
      </div>
    </>
  );
}

/** A centred title under the back link, as PageHeader draws a material's name. */
function TitleTop() {
  return (
    <div className="grid justify-items-center gap-2 py-[5px] min-[560px]:pt-[24px] min-[560px]:pb-[20px]">
      <BackRow />
      <Bone className="mt-1 h-[24px] w-3/5 max-w-[360px] rounded-[10px] min-[560px]:h-[30px]" />
    </div>
  );
}

const reading = "frosted-panel grid gap-3 px-4 py-5 min-[560px]:px-7 min-[560px]:py-7";

/** «Կարդացել եմ» and the four tiles under every material. */
function MaterialActions() {
  return (
    <>
      <Bone className="h-12 w-full rounded-[16px] opacity-70" />
      <span className="grid grid-cols-4 gap-2">{repeat(4, (index) => <span key={index} className="action-tile grid min-h-[64px] place-items-center rounded-[16px]"><span className="grid justify-items-center gap-1.5"><Bone className="size-5 rounded-[6px]" /><Bone className="h-2.5 w-10 rounded-full" /></span></span>)}</span>
    </>
  );
}

function MaterialBody({ section }: { section: Section }) {
  switch (section) {
    case "saints":
      // The saint's picture, then the life in a book serif.
      return (
        <>
          <div className="frosted-panel overflow-hidden p-0"><Bone className="aspect-[4/5] w-full max-h-[70svh] opacity-70" /></div>
          <div className={reading}><Lines count={9} className="h-4" /></div>
        </>
      );
    case "gospel":
      // The talk's video, a short note, then the actions.
      return (
        <>
          <div className="frosted-panel overflow-hidden p-0">
            <span className="relative grid aspect-video place-items-center bg-[radial-gradient(circle_at_30%_20%,rgb(217_181_111/14%),transparent_55%)]">
              <Bone className="absolute inset-0 opacity-50" />
              <span className="relative size-14 rounded-full border border-[rgb(240_211_151/45%)] bg-[rgb(217_181_111/10%)]" />
            </span>
            <span className="flex items-center gap-3 px-4 py-3"><Bone className="size-4 rounded-full" /><Bone className="h-1.5 flex-1 rounded-full" /></span>
          </div>
          <div className={reading}><Lines count={2} className="h-4" /></div>
          <MaterialActions />
        </>
      );
    case "daily":
      // The feast and the day's readings, one per line.
      return (
        <>
          <div className={reading}>{["w-3/4", "w-32", "w-28", "w-32"].map((width, index) => <Bone key={index} className={`h-4 rounded-full ${width}`} />)}</div>
          <MaterialActions />
        </>
      );
    case "psalms":
      // The superscription, then numbered verses.
      return (
        <>
          <div className={reading}>
            <span className="flex justify-between"><Bone className="h-3 w-36 rounded-full" /><Bone className="h-8 w-32 rounded-[12px]" /></span>
            <span className="grid justify-items-center gap-3 border-b border-[rgb(217_181_111/32%)] pt-2 pb-4"><Bone className="h-4 w-32 rounded-full" /></span>
            {repeat(4, (verse) => (
              <span key={verse} className="grid grid-cols-[18px_1fr] gap-x-2 gap-y-3 pt-2">
                <Bone className="h-4 w-3 rounded-full" />
                <Lines count={2} className="h-4" last={verse % 2 ? "w-2/5" : "w-3/5"} />
              </span>
            ))}
          </div>
          <MaterialActions />
        </>
      );
    case "pray":
      // The prayer opens with its large bird letter.
      return (
        <>
          <div className={reading}>
            <span className="grid grid-cols-[56px_1fr] gap-x-3">
              <Bone className="size-14 rounded-[14px]" />
              <Lines count={3} className="h-4" last="w-full" />
            </span>
            <Lines count={6} className="h-4" />
          </div>
          <MaterialActions />
        </>
      );
    default:
      return (
        <>
          <div className={reading}><Lines count={8} className="h-4" /></div>
          <MaterialActions />
        </>
      );
  }
}

function Home() {
  return (
    <>
      <div className="relative mt-[10px] w-full pt-[12px] min-[560px]:mt-[16px] min-[560px]:pt-[20px]">
        <img className="absolute top-[12px] -left-[10px] z-4 block h-auto w-[27%] min-[560px]:top-[20px]" src={angelLeft} alt="" width={540} height={728} />
        <ArtImage className="relative z-1 block h-auto w-full" src={lastSupper} sizes="(max-width: 1100px) 100vw, 1100px" alt="" width={1774} height={887} />
        <img className="absolute top-[12px] -right-[10px] z-4 block h-auto w-[27%] scale-x-[-1] min-[560px]:top-[20px]" src={angelLeft} alt="" width={540} height={728} />
      </div>
      <div className="grid justify-items-center gap-3 pt-1 pb-2 text-center">
        <Ornament />
        <p className="m-0 whitespace-nowrap font-noto text-[clamp(26px,8.4vw,36px)] leading-[1.12] font-medium tracking-[-0.6px] text-ink min-[560px]:text-[46px] min-[960px]:text-[56px]">Հոգևոր ժառանգություն</p>
        <Bone className="h-12 w-full max-w-[330px] rounded-[18px]" />
      </div>
      <div className="mt-2 grid justify-items-center gap-2.5 py-3"><Bone className="h-2.5 w-36 rounded-full" /><Lines count={3} className="h-4 max-w-[420px]" last="w-1/2" center /></div>
      <span className="mt-3 mb-1 flex min-h-[52px] w-full items-center gap-[10px] rounded-[16px] border border-glass-border bg-control px-[14px] shadow-card"><Bone className="size-[18px] rounded-full" /><Bone className="h-3.5 w-1/2 rounded-full" /></span>
      <div className="mt-4 grid gap-3">
        <Bone className="ml-1 h-3 w-20 rounded-full" />
        <ol className="m-0 grid list-none gap-2.5 p-0 min-[560px]:grid-cols-2 min-[960px]:grid-cols-3">
          {repeat(7, (index) => (
            <li key={index} className="frosted-card flex min-h-[64px] items-center gap-3 px-3 py-3">
              <Bone className="size-10 shrink-0 rounded-full" />
              <span className="grid flex-1 gap-2"><Bone className="h-4 w-1/2 rounded-full" /><Bone className="h-2.5 w-16 rounded-full" /></span>
              <Bone className="size-5 rounded-full" />
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

/** A settings panel: its icon and name, a line of help, the choices in a row. */
function SettingPanel({ options }: { options: number }) {
  return (
    <div className="frosted-panel grid gap-3 p-4">
      <span className="grid grid-cols-[34px_1fr] items-start gap-3">
        <Bone className="size-[34px] rounded-full" />
        <span className="grid gap-2 pt-1"><Bone className="h-4 w-28 rounded-full" /><Bone className="h-3 w-full rounded-full" /><Bone className="h-3 w-2/3 rounded-full" /></span>
      </span>
      {options ? <span className={`grid gap-1 rounded-[16px] border border-glass-border p-1 ${options === 4 ? "grid-cols-4" : "grid-cols-2"}`}>{repeat(options, (index) => <span key={index} className="grid h-14 place-items-center"><span className="grid justify-items-center gap-1.5"><Bone className="size-4 rounded-full" /><Bone className="h-2.5 w-12 rounded-full" /></span></span>)}</span> : <Bone className="h-2 w-full rounded-full" />}
    </div>
  );
}

function Content({ kind }: { kind: Kind }) {
  switch (kind.page) {
    case "home":
      return <Home />;
    case "section":
      return <SectionPage section={kind.section} />;
    case "material":
      return (
        <>
          <TitleTop />
          <div className="mt-3 grid gap-4 min-[560px]:mt-4"><MaterialBody section={kind.section} /></div>
        </>
      );
    case "verse":
      return (
        <>
          <TitleTop />
          <div className="mt-4 grid gap-4">
            <div className="frosted-panel grid justify-items-center gap-3 px-5 py-8 min-[560px]:px-9 min-[560px]:py-10"><Bone className="mb-2 h-3 w-24 rounded-full" /><Lines count={3} className="h-5" last="w-2/3" center /></div>
            <Bone className="h-12 w-full rounded-[16px] opacity-70" />
            <span className="flex justify-between"><Bone className="h-9 w-16 rounded-full" /><Bone className="h-9 w-24 rounded-full" /><Bone className="h-9 w-16 rounded-full" /></span>
          </div>
        </>
      );
    case "search":
      return (
        <>
          <PageHeader backTo="/" backLabel="Գրադարան" showSearch={false} title="Որոնում" eyebrow="Ամբողջ գրադարանը" />
          <div className="mx-auto mt-2 grid w-full max-w-[520px] justify-items-center gap-2"><Bone className="h-3.5 w-full rounded-full" /><Bone className="h-3.5 w-2/3 rounded-full" /></div>
          <div className="frosted-panel mt-4 grid gap-3 p-3"><span className="flex min-h-[52px] items-center gap-3 rounded-[16px] border border-glass-border bg-control px-3"><Bone className="size-[18px] rounded-full" /><Bone className="h-3.5 w-1/2 rounded-full" /><Bone className="ml-auto size-10 rounded-[12px]" /></span><Bone className="h-11 w-full rounded-[14px] opacity-70" /></div>
          <div className="frosted-panel mt-4 grid gap-3 p-5"><Bone className="size-6 rounded-full" /><Bone className="h-4 w-48 rounded-full" /><Lines count={2} className="h-3" /></div>
        </>
      );
    case "saved":
      return (
        <>
          <SectionTop image={MY_CORNER_IMAGE} />
          <div className="frosted-panel grid gap-3 p-4">
            <span className="flex items-center justify-between"><span className="grid gap-2"><Bone className="h-4 w-40 rounded-full" /><Bone className="h-3 w-24 rounded-full" /></span><Bone className="h-8 w-14 rounded-full" /></span>
            <Bone className="h-14 w-full rounded-[14px] opacity-70" />
            <span className="grid grid-cols-7 gap-1.5">{repeat(28, (index) => <span key={index} className="page-bone aspect-square rounded-[12px]" />)}</span>
          </div>
        </>
      );
    case "settings":
      return (
        <>
          <PageHeader backTo="/" backLabel="Գրադարան" title="Կարգավորումներ" description="Հարմարեցրեք գրադարանը Ձեզ համար։ Կարգավորումները պահվում են այս սարքում։" />
          <div className="mt-4 grid gap-3"><SettingPanel options={4} /><SettingPanel options={4} /><SettingPanel options={0} /></div>
        </>
      );
    case "places":
      return (
        <>
          <PageHeader backTo="/" backLabel="Գրադարան" title="Սրբավայրեր" />
          <div className="mx-auto grid w-full max-w-[520px] justify-items-center gap-2"><Bone className="h-3.5 w-full rounded-full" /><Bone className="h-3.5 w-3/4 rounded-full" /></div>
          <div className="mx-auto mt-4 grid w-full max-w-[1040px] gap-3">
            <span className="flex gap-2"><span className="frosted-panel grid flex-1 grid-cols-3 gap-1 rounded-[18px] p-1.5">{repeat(3, (index) => <span key={index} className="grid h-11 place-items-center"><span className="grid justify-items-center gap-1.5"><Bone className="h-4 w-6 rounded-full" /><Bone className="h-2 w-14 rounded-full" /></span></span>)}</span><Bone className="size-[58px] rounded-[18px]" /></span>
            <Bone className="aspect-[1/0.85] w-full rounded-[22px] opacity-60 min-[860px]:aspect-auto min-[860px]:h-[min(72svh,560px)]" />
          </div>
          <Bone className="mx-auto mt-4 h-11 w-64 rounded-full" />
          <div className="mt-5 grid grid-cols-2 gap-2"><Bone className="col-span-2 h-12 rounded-[18px]" />{repeat(6, (index) => <Bone key={index} className="h-14 rounded-[18px]" />)}</div>
        </>
      );
    case "place":
      return (
        <>
          <PageHeader backTo="/places" backLabel="Սրբավայրեր" title={<Bone className="mx-auto h-[26px] w-52 rounded-[10px]" />} />
          <Bone className="mx-auto mt-1 mb-4 h-3 w-48 rounded-full" />
          <div className="grid gap-4">
            <Bone className="mx-auto aspect-[4/3] w-full max-w-[720px] rounded-[18px]" />
            <Bone className="mx-auto h-11 w-full max-w-[420px] rounded-[14px] opacity-70" />
            {repeat(2, (index) => <div key={index} className="frosted-panel grid gap-3 p-5"><Bone className="h-4 w-32 rounded-full" /><Lines count={3} /></div>)}
          </div>
        </>
      );
    case "text":
      return (
        <>
          <PageHeader backTo="/" backLabel="Գրադարան" showSearch={false} title={kind.title} />
          <div className="mt-3 grid gap-4">{repeat(3, (index) => <div key={index} className="frosted-panel grid gap-3 p-5 min-[560px]:p-7"><Bone className="h-4 w-48 rounded-full" /><Lines count={index === 1 ? 3 : 4} /></div>)}</div>
        </>
      );
    default:
      return (
        <>
          <TitleTop />
          <div className="mt-4 grid gap-3">{repeat(3, (index) => <div key={index} className="frosted-panel grid gap-3 p-5"><Bone className="h-4 w-40 rounded-full" /><Lines count={3} /></div>)}</div>
        </>
      );
  }
}

export function PageSkeleton({ pathname }: { pathname: string }) {
  const kind = kindOf(pathname);
  const wide = kind.page === "home";
  return (
    <div className="page-skeleton fixed inset-0 z-[2000] overflow-hidden" role="status" aria-label="Բեռնվում է…">
      <div className={`pointer-events-none mx-auto flex w-full flex-col ${wide ? "max-w-[1180px]" : "max-w-[940px]"} pt-[calc(var(--tg-inset-top,0px)+12px)] pr-[calc(var(--tg-inset-right,0px)+14px)] pl-[calc(var(--tg-inset-left,0px)+14px)] min-[560px]:pt-[calc(var(--tg-inset-top,0px)+20px)] min-[560px]:pr-[calc(var(--tg-inset-right,0px)+24px)] min-[560px]:pl-[calc(var(--tg-inset-left,0px)+24px)] min-[960px]:pr-[calc(var(--tg-inset-right,0px)+32px)] min-[960px]:pl-[calc(var(--tg-inset-left,0px)+32px)] min-[1440px]:pt-[calc(var(--tg-inset-top,0px)+26px)]`} aria-hidden="true">
        <Content kind={kind} />
      </div>
    </div>
  );
}
