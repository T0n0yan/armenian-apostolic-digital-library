import { env } from "cloudflare:workers";
import { ChevronRight, Pencil, Volume2 } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/church-hymns";
import { can, getOptionalTelegramAdmin } from "../auth/admin.server";
import { card, groupTitle } from "../components/etiquette-ui";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { CHURCH_TITLE } from "../data/church";
import { listHymns } from "../data/hymns.server";
import { listChurchAudio } from "../data/liturgy-text.server";
import { filterHymns, HOURS, MODES, type Hour } from "../utils/hymns";
import { breadcrumbJsonLd, seoMeta } from "../utils/seo";

const TITLE = "Շարականներ";

export function meta({}: Route.MetaArgs) {
  return seoMeta({
    title: `${TITLE}. ${CHURCH_TITLE} — Apostolic.am`,
    description: "Հայ Եկեղեցու շարականները՝ ըստ տոնի և ժամի, ձայնեղանակով և ձայնագրությամբ։",
    path: "/church/sharakanner",
    jsonLd: [breadcrumbJsonLd([{ name: "Գլխավոր", path: "/" }, { name: CHURCH_TITLE, path: "/church" }, { name: TITLE, path: "/church/sharakanner" }])],
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const [hymns, audio, admin] = await Promise.all([listHymns(env.DB), listChurchAudio(env.DB, "hymn-"), getOptionalTelegramAdmin(request, env.DB).catch(() => null)]);
  return {
    hymns: hymns.map(({ id, title, feast, hour, mode, performer }) => ({ id, title, feast, hour, mode, performer, audio: audio.has(`hymn-${id}`) })),
    editor: can(admin, "guides"),
  };
}

const select = "min-h-10 min-w-0 flex-1 rounded-button border border-[var(--field-border)] bg-control px-2.5 text-[14px] text-ink";
const divider = "border-t border-[rgb(150_110_50/14%)]";

/** Շարականների ցանկը՝ տոնի, ժամի և ձայնեղանակի ֆիլտրերով (?feast=&hour=&mode=)։ */
export default function ChurchHymns({ loaderData }: Route.ComponentProps) {
  const { hymns, editor } = loaderData;
  const [params, setParams] = useSearchParams();
  const filter = { feast: params.get("feast") ?? "", hour: params.get("hour") ?? "", mode: params.get("mode") ?? "" };
  const feasts = [...new Set(hymns.map((hymn) => hymn.feast).filter(Boolean))].sort((a, b) => a.localeCompare(b, "hy"));
  const shown = filterHymns(hymns, filter);
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true, preventScrollReset: true });
  };
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/church" backLabel={CHURCH_TITLE} title="" showSearch={false} />
      <header className="mt-2 grid gap-1.5 px-1">
        <h1 className="m-0 font-noto text-[28px] leading-[36px] font-semibold tracking-[-0.3px] text-ink min-[560px]:text-[34px] min-[560px]:leading-[42px]">{TITLE}</h1>
        <p className="m-0 text-[14.5px] leading-[1.6] text-muted">Եկեղեցական երգերը՝ ըստ տոնի և ժամի։ Ժամերի մասին՝ <Link className="text-gold-bright" to="/church/hours">Ժամերգություններ</Link>։</p>
        {editor ? <Link className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-gold-bright" to="/admin/hymns"><Pencil aria-hidden="true" size={13} />Խմբագրել</Link> : null}
      </header>

      <div className="paper-card mt-4 flex flex-wrap gap-1.5 p-1.5">
        <select className={select} value={filter.feast} onChange={(event) => set("feast", event.target.value)} aria-label="Տոն">
          <option value="">Բոլոր տոները</option>
          {feasts.map((feast) => <option key={feast} value={feast}>{feast}</option>)}
        </select>
        <select className={select} value={filter.hour} onChange={(event) => set("hour", event.target.value)} aria-label="Ժամ">
          <option value="">Բոլոր ժամերը</option>
          {(Object.keys(HOURS) as Hour[]).map((hour) => <option key={hour} value={hour}>{HOURS[hour]}</option>)}
        </select>
        <select className={select} value={filter.mode} onChange={(event) => set("mode", event.target.value)} aria-label="Ձայնեղանակ">
          <option value="">Բոլոր ձայնեղանակները</option>
          {MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
        </select>
      </div>

      <section className="mt-5 grid gap-2" aria-labelledby="hymns-found">
        <h2 className={groupTitle} id="hymns-found">{shown.length ? `Շարականներ՝ ${shown.length}` : "Այս ընտրությամբ շարական դեռ չկա"}</h2>
        {shown.length ? (
          <ul className={`${card} m-0 list-none p-0`}>
            {shown.map((hymn, index) => (
              <li key={hymn.id} className={index ? divider : ""}>
                <Link className="flex min-h-[64px] items-center gap-3 px-4 py-3 text-inherit no-underline" to={`/church/sharakanner/${hymn.id}`}>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <strong className="font-noto text-[15.5px] leading-snug font-semibold text-ink">{hymn.title}</strong>
                    <span className="text-[12.5px] leading-snug text-muted">{[hymn.feast, hymn.hour ? HOURS[hymn.hour] : "", hymn.mode, hymn.performer].filter(Boolean).join(" · ")}</span>
                  </span>
                  {hymn.audio ? <Volume2 className="shrink-0 text-gold" aria-label="Կա ձայնագրություն" size={17} /> : null}
                  <ChevronRight className="shrink-0 text-faint" aria-hidden="true" size={18} />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </PageShell>
  );
}
