import { env } from "cloudflare:workers";
import { CirclePlay, Clock3, Upload } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link, useRouteLoaderData } from "react-router";

import type { Route } from "./+types/help";
import type { loader as rootLoader } from "../root";
import { HelpVideoSheet } from "../components/help-video-sheet";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { readHelpConfig } from "../data/help-videos.server";
import { helpVideoList } from "../utils/help-videos";
import { seoMeta } from "../utils/seo";

export function meta({}: Route.MetaArgs) {
  return seoMeta({
    title: "Օգնություն — Apostolic.am",
    description: "Կարճ տեսանյութեր՝ ինչպես օգտվել կայքից. որոնում, պահել, նշումներ, հիշեցումներ, սրբավայրերի քարտեզ և այլն։",
    path: "/ognutyun",
  });
}

export async function loader({}: Route.LoaderArgs) {
  return { videos: helpVideoList(await readHelpConfig(env.DB)) };
}

/** Օգնություն. ուսուցողական տեսանյութերի ցանկ, սեղմելիս տեսանյութը բացվում է։ */
export default function Help({ loaderData }: Route.ComponentProps) {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const canUpload = Boolean(root?.showAdminLink) || (root?.adminPermissions ?? []).includes("help");
  const ready = useMemo(() => loaderData.videos.filter((video) => video.url), [loaderData.videos]);
  const [open, setOpen] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const card = "paper-card flex w-full items-center gap-3 rounded-card px-3.5 py-3 text-left";

  return (
    <PageShell>
      <SiteNav />
      <PageHeader showSearch={false} backTo="/" backLabel="Գրադարան" title="Օգնություն" />
      <p className="mx-auto mt-2 mb-4 max-w-[34rem] text-center text-[14.5px] leading-relaxed text-muted">
        Կարճ տեսանյութեր՝ ինչպես օգտվել կայքից։ Սեղմեք վերնագրի վրա, և տեսանյութը կբացվի։
      </p>
      {canUpload ? (
        <Link className="mb-3 inline-flex min-h-10 items-center gap-1.5 self-center rounded-full border border-[rgb(217_181_111/40%)] px-4 text-[13px] font-bold text-gold-bright no-underline" to="/admin/help">
          <Upload aria-hidden="true" size={15} /> Վերբեռնել տեսանյութեր
        </Link>
      ) : null}
      <ol className="m-0 grid list-none gap-2.5 p-0 min-[760px]:grid-cols-2">
        {loaderData.videos.map((video) => {
          const position = ready.findIndex((item) => item.id === video.id);
          const inner = (
            <>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#f1d79c,#c99a4b_60%,#a87a32)] text-[15px] font-bold text-[#2a1708] tabular-nums">{video.number}</span>
              <span className="min-w-0 flex-1 font-noto text-[15.5px] leading-snug text-ink">{video.title}</span>
              {video.url
                ? <CirclePlay aria-hidden="true" size={24} className="shrink-0 text-gold-bright" />
                : <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-faint"><Clock3 aria-hidden="true" size={14} /> Շուտով</span>}
            </>
          );
          return (
            <li key={video.id}>
              {video.url
                ? <button className={`${card} cursor-pointer border-0`} type="button" onClick={() => setOpen(position)}>{inner}</button>
                : <div className={`${card} opacity-60`} aria-disabled="true">{inner}</div>}
            </li>
          );
        })}
      </ol>
      {open !== null ? <HelpVideoSheet videos={ready} index={open} onIndex={setOpen} onClose={close} /> : null}
    </PageShell>
  );
}
