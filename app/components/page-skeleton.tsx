/**
 * The outline of the page being opened, drawn while it loads: the same layout as the real page in
 * soft gold shapes that shimmer, on the page's own background. One per kind of page.
 */
type Kind = "home" | "section" | "material" | "verse" | "search" | "places" | "place" | "page";

const PAGES = new Set(["saved", "settings", "mer-masin", "kap", "privacy", "admin"]);

function kindOf(pathname: string): Kind {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return "home";
  if (parts[0] === "search") return "search";
  if (parts[0] === "places") return parts.length > 1 ? "place" : "places";
  if (parts[0] === "materials") return "material";
  if (parts[0] === "categories") return "section";
  if (PAGES.has(parts[0])) return "page";
  if (parts.length === 1) return "section";
  return parts.length === 2 ? "material" : "verse";
}

/** One shimmering shape. */
function Bone({ className = "" }: { className?: string }) {
  return <span className={`page-bone block ${className}`} />;
}

/** «← Back» on the left, the search circle on the right, the centred title and its line under it. */
function Header({ description = true }: { description?: boolean }) {
  return (
    <>
      <div className="flex items-center justify-between"><Bone className="h-5 w-24 rounded-full" /><Bone className="size-10 rounded-full" /></div>
      <Bone className="mx-auto mt-4 h-8 w-48 rounded-[12px]" />
      {description ? <div className="mx-auto mt-3 grid w-full max-w-[520px] justify-items-center gap-2"><Bone className="h-3.5 w-full rounded-full" /><Bone className="h-3.5 w-2/3 rounded-full" /></div> : null}
    </>
  );
}

function Lines({ count, last = "w-3/5" }: { count: number; last?: string }) {
  return <div className="grid gap-2.5">{Array.from({ length: count }, (_, index) => <Bone key={index} className={`h-3.5 rounded-full ${index === count - 1 ? last : "w-full"}`} />)}</div>;
}

/** A row of the lists: a picture and two lines of text. */
function ListCard() {
  return (
    <div className="page-bone-card flex items-center gap-3 p-3">
      <Bone className="size-14 shrink-0 rounded-[14px]" />
      <div className="grid flex-1 gap-2"><Bone className="h-4 w-3/4 rounded-full" /><Bone className="h-3 w-1/2 rounded-full" /></div>
    </div>
  );
}

function Content({ kind }: { kind: Kind }) {
  switch (kind) {
    case "home":
      return (
        <>
          <Bone className="mx-auto aspect-[2.1] w-full max-w-[640px] rounded-[26px]" />
          <Bone className="mx-auto mt-5 h-9 w-64 rounded-[12px]" />
          <Bone className="mx-auto mt-3 h-11 w-full max-w-[520px] rounded-[18px]" />
          <div className="mx-auto mt-7 grid w-full max-w-[520px] justify-items-center gap-2.5"><Bone className="h-4 w-full rounded-full" /><Bone className="h-4 w-5/6 rounded-full" /><Bone className="h-4 w-2/3 rounded-full" /></div>
          <Bone className="mt-8 h-14 w-full rounded-[20px]" />
          <div className="mt-6 grid gap-3 min-[700px]:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <ListCard key={index} />)}</div>
        </>
      );
    case "section":
    case "search":
      return (
        <>
          <Header description={kind === "section"} />
          <Bone className="mt-5 h-12 w-full rounded-[18px]" />
          <div className="mt-5 grid gap-3">{Array.from({ length: 6 }, (_, index) => <ListCard key={index} />)}</div>
        </>
      );
    case "material":
      return (
        <>
          <div className="flex items-center justify-between"><Bone className="h-5 w-28 rounded-full" /><Bone className="size-10 rounded-full" /></div>
          <div className="mx-auto mt-5 grid w-full max-w-[560px] justify-items-center gap-2.5"><Bone className="h-7 w-5/6 rounded-[12px]" /><Bone className="h-7 w-1/2 rounded-[12px]" /><Bone className="mt-1 h-3 w-40 rounded-full" /></div>
          <div className="page-bone-card mt-6 p-5"><Lines count={11} /></div>
        </>
      );
    case "verse":
      return (
        <>
          <Header description={false} />
          <div className="page-bone-card mt-6 grid justify-items-center gap-3 px-6 py-10"><Bone className="h-5 w-full rounded-full" /><Bone className="h-5 w-5/6 rounded-full" /><Bone className="h-5 w-2/3 rounded-full" /><Bone className="mt-3 h-3 w-32 rounded-full" /></div>
        </>
      );
    case "places":
      return (
        <>
          <Header />
          <Bone className="mx-auto mt-4 h-14 w-full max-w-[560px] rounded-[18px]" />
          <Bone className="mx-auto mt-3 aspect-[1/0.8] w-full max-w-[720px] rounded-[40%_32%_44%_30%]" />
          <div className="mt-5 grid grid-cols-2 gap-2"><Bone className="col-span-2 h-12 rounded-[18px]" />{Array.from({ length: 6 }, (_, index) => <Bone key={index} className="h-12 rounded-[18px]" />)}</div>
        </>
      );
    case "place":
      return (
        <>
          <Header description={false} />
          <Bone className="mx-auto mt-2 h-3 w-52 rounded-full" />
          <Bone className="mt-5 aspect-[4/3] w-full max-w-[720px] self-center rounded-[18px]" />
          <Bone className="mx-auto mt-3 h-9 w-full max-w-[420px] rounded-[11px]" />
          {Array.from({ length: 2 }, (_, index) => <div key={index} className="page-bone-card mt-4 grid gap-3 p-5"><Bone className="h-4 w-36 rounded-full" /><Lines count={3} /></div>)}
        </>
      );
    default:
      return (
        <>
          <Header />
          {Array.from({ length: 3 }, (_, index) => <div key={index} className="page-bone-card mt-4 grid gap-3 p-5"><Bone className="h-4 w-40 rounded-full" /><Lines count={3} /></div>)}
        </>
      );
  }
}

export function PageSkeleton({ pathname }: { pathname: string }) {
  return (
    <div className="page-skeleton fixed inset-0 z-[80] overflow-hidden" role="status" aria-label="Բեռնվում է…">
      <div className="mx-auto flex w-full max-w-[940px] flex-col px-[14px] pt-[calc(var(--tg-inset-top,0px)+12px)] min-[560px]:px-6 min-[560px]:pt-5">
        <Content kind={kindOf(pathname)} />
      </div>
    </div>
  );
}
