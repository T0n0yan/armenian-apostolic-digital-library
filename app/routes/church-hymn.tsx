import { env } from "cloudflare:workers";
import { Pencil } from "lucide-react";
import { Link } from "react-router";
import type { Route } from "./+types/church-hymn";
import { can, getOptionalTelegramAdmin } from "../auth/admin.server";
import { card, groupTitle } from "../components/etiquette-ui";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { CHURCH_TITLE } from "../data/church";
import { getHymn } from "../data/hymns.server";
import { getChurchAudio } from "../data/liturgy-text.server";
import { GUIDE_STATUSES } from "../utils/guides";
import { HOURS } from "../utils/hymns";
import { breadcrumbJsonLd, NOINDEX, seoMeta } from "../utils/seo";

export async function loader({ request, params }: Route.LoaderArgs) {
  const id = Number(params.id);
  const hymn = Number.isInteger(id) && id > 0 ? await getHymn(env.DB, id) : null;
  const admin = await getOptionalTelegramAdmin(request, env.DB).catch(() => null);
  const editor = can(admin, "guides");
  if (!hymn || (hymn.status === "draft" && !editor)) throw new Response("Not Found", { status: 404 });
  return { hymn, audio: await getChurchAudio(env.DB, `hymn-${hymn.id}`), editor };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const hymn = loaderData?.hymn;
  if (!hymn) return [{ title: "Շարական — Apostolic.am" }];
  const path = `/church/sharakanner/${hymn.id}`;
  const tags = seoMeta({
    title: `${hymn.title}. Շարականներ — Apostolic.am`,
    description: [hymn.feast, hymn.mode, hymn.performer].filter(Boolean).join(" · ") || "Շարական",
    path,
    jsonLd: [breadcrumbJsonLd([{ name: "Գլխավոր", path: "/" }, { name: CHURCH_TITLE, path: "/church" }, { name: "Շարականներ", path: "/church/sharakanner" }, { name: hymn.title, path }])],
  });
  return hymn.status === "draft" ? [...tags, ...NOINDEX] : tags;
}

/** Մեկ շարական՝ ձայնագրություն, գրաբար և աշխարհաբար տեքստ։ */
export default function ChurchHymn({ loaderData }: Route.ComponentProps) {
  const { hymn, audio, editor } = loaderData;
  const facts: Array<[string, string]> = [["Տոն", hymn.feast], ["Ժամ", hymn.hour ? HOURS[hymn.hour] : ""], ["Ձայնեղանակ", hymn.mode], ["Կատարող", hymn.performer]];
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/church/sharakanner" backLabel="Շարականներ" title="" showSearch={false} />
      <header className="mt-2 grid gap-2 px-1">
        <h1 className="m-0 font-noto text-[26px] leading-[34px] font-semibold tracking-[-0.3px] text-ink min-[560px]:text-[32px] min-[560px]:leading-[40px]">{hymn.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`w-fit rounded-chip px-2 py-0.5 text-[11.5px] font-bold ${hymn.status === "published" ? "bg-[rgb(61_118_80/16%)] text-success" : "bg-[rgb(217_181_111/20%)] text-gold-bright"}`}>{GUIDE_STATUSES[hymn.status]}</span>
          {editor ? <Link className="inline-flex items-center gap-1 text-[13px] font-semibold text-gold-bright" to={`/admin/hymns?edit=${hymn.id}`}><Pencil aria-hidden="true" size={13} />Խմբագրել</Link> : null}
        </div>
      </header>
      <dl className={`${card} mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-4 py-3 text-[14px]`}>
        {facts.filter(([, value]) => value).map(([label, value]) => <div key={label} className="contents"><dt className="text-muted">{label}</dt><dd className="m-0 text-ink">{value}</dd></div>)}
      </dl>
      {audio ? <audio className="mt-4 w-full" src={audio.url} controls preload="none" /> : <p className="mt-4 mb-0 px-1 text-[13px] text-muted">Ձայնագրությունը շուտով։</p>}
      {hymn.grabar ? <section className="mt-6 grid gap-2"><h2 className={groupTitle}>Գրաբար</h2><p className={`${card} prayer-text m-0 whitespace-pre-line px-4 py-4 text-[18px] leading-[1.7] text-ink`}>{hymn.grabar}</p></section> : null}
      {hymn.ashkharhabar ? <section className="mt-6 grid gap-2"><h2 className={groupTitle}>Աշխարհաբար</h2><p className={`${card} reading-body m-0 whitespace-pre-line px-4 py-4 text-[16px] leading-[1.7] text-ink`}>{hymn.ashkharhabar}</p></section> : null}
      {hymn.note ? <p className={`${card} mt-4 mb-0 px-4 py-3 text-[14px] leading-relaxed text-muted`}>{hymn.note}</p> : null}
      {hymn.status !== "published" ? <p className="mx-auto mt-7 mb-0 text-center text-[12.5px] text-muted">⚑ Ճշտել. տեքստը ստուգվում է քահանայի կողմից։</p> : null}
    </PageShell>
  );
}
