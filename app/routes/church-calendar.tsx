import { env } from "cloudflare:workers";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Link } from "react-router";
import type { Route } from "./+types/church-calendar";
import { can, getOptionalTelegramAdmin } from "../auth/admin.server";
import { card, groupTitle } from "../components/etiquette-ui";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { listOverrides } from "../data/calendar.server";
import { CHURCH_TITLE } from "../data/church";
import { CALENDAR_KINDS, dayMonth, fastPeriods, MONTHS, todayLine, weekdayName, yearFeasts } from "../utils/church-calendar";
import { yerevanDay } from "../utils/liturgy";
import { breadcrumbJsonLd, seoMeta } from "../utils/seo";

const TITLE = "Տոնացույց և պահքի օրեր";

export function meta({ loaderData }: Route.MetaArgs) {
  const year = loaderData?.year;
  return seoMeta({
    title: `${TITLE}${year ? ` ${year}` : ""} — Apostolic.am`,
    description: "Հայ Առաքելական Եկեղեցու տոները և պահքի օրերը՝ ամիս առ ամիս, Զատկից հաշվարկված։",
    path: "/church/calendar",
    jsonLd: [breadcrumbJsonLd([{ name: "Գլխավոր", path: "/" }, { name: CHURCH_TITLE, path: "/church" }, { name: TITLE, path: "/church/calendar" }])],
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const today = yerevanDay();
  const asked = Number(new URL(request.url).searchParams.get("year"));
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : Number(today.slice(0, 4));
  const [overrides, admin] = await Promise.all([listOverrides(env.DB, year), getOptionalTelegramAdmin(request, env.DB).catch(() => null)]);
  return { year, today: todayLine(today, today.startsWith(`${year}-`) ? overrides : []), feasts: yearFeasts(year, overrides), periods: fastPeriods(year), editor: can(admin, "guides") };
}

const divider = "border-t border-[rgb(150_110_50/14%)]";
const dateLabel = (day: string) => `${dayMonth(day)}, ${weekdayName(day).toLocaleLowerCase("hy")}`;

/** Տարվա տոները և պահքերը՝ ամիս առ ամիս։ */
export default function ChurchCalendar({ loaderData }: Route.ComponentProps) {
  const { year, today, feasts, periods, editor } = loaderData;
  const months = MONTHS.map((name, index) => ({ name, items: feasts.filter((entry) => Number(entry.day.slice(5, 7)) === index + 1) })).filter((month) => month.items.length);
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/church" backLabel={CHURCH_TITLE} title="" showSearch={false} />
      <header className="mt-2 grid gap-1.5 px-1">
        <h1 className="m-0 font-noto text-[28px] leading-[36px] font-semibold tracking-[-0.3px] text-ink min-[560px]:text-[34px] min-[560px]:leading-[42px]">{TITLE}</h1>
        <div className="flex items-center gap-2">
          <Link className="grid size-9 place-items-center rounded-full text-gold-bright" to={`?year=${year - 1}`} aria-label={`${year - 1}`}><ChevronLeft aria-hidden="true" size={18} /></Link>
          <strong className="text-[18px] tabular-nums text-ink">{year}</strong>
          <Link className="grid size-9 place-items-center rounded-full text-gold-bright" to={`?year=${year + 1}`} aria-label={`${year + 1}`}><ChevronRight aria-hidden="true" size={18} /></Link>
          {editor ? <Link className="ml-auto inline-flex items-center gap-1 text-[13px] font-semibold text-gold-bright" to={`/admin/calendar?year=${year}`}><Pencil aria-hidden="true" size={13} />Ուղղել</Link> : null}
        </div>
      </header>

      {today.day.startsWith(`${year}-`) ? (
        <section className={`${card} mt-4 grid gap-1 px-4 py-3.5`} aria-label="Այսօր">
          <span className={groupTitle + " !px-0"}>Այսօր՝ {dateLabel(today.day)}</span>
          <span className="text-[15.5px] leading-snug text-ink">{[...today.feasts, today.fast ? `Պահք (${today.fast})` : ""].filter(Boolean).join(" · ") || "Սովորական օր"}</span>
        </section>
      ) : null}

      {months.map((month) => (
        <section key={month.name} className="mt-6 grid gap-2" aria-labelledby={`m-${month.name}`}>
          <h2 className={groupTitle} id={`m-${month.name}`}>{month.name}</h2>
          <ul className={`${card} m-0 list-none p-0`}>
            {month.items.map((entry, index) => (
              <li key={`${entry.day}-${entry.title}`} id={entry.day} className={`flex items-center gap-3 px-4 py-2.5 ${index ? divider : ""} ${entry.day === today.day ? "bg-[rgb(217_181_111/10%)]" : ""}`}>
                <span className="w-[92px] shrink-0 text-[12.5px] leading-snug text-muted">{dateLabel(entry.day)}</span>
                <span className="grid min-w-0 flex-1 gap-1">
                  <span className={`text-[15px] leading-snug ${entry.kind === "taghavar" ? "font-semibold text-ink" : "text-ink"}`}>{entry.title}</span>
                  <span className={`w-fit rounded-chip px-2 py-0.5 text-[11px] font-bold ${CALENDAR_KINDS[entry.kind].className}`}>{CALENDAR_KINDS[entry.kind].label}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-6 grid gap-2" aria-labelledby="fasts">
        <h2 className={groupTitle} id="fasts">Պահքեր</h2>
        <ul className={`${card} m-0 list-none p-0`}>
          {periods.map((period, index) => (
            <li key={`${period.from}-${period.title}`} className={`flex items-center gap-3 px-4 py-2.5 ${index ? divider : ""}`}>
              <span className="w-[120px] shrink-0 text-[12.5px] text-muted">{dayMonth(period.from)}{period.to !== period.from ? ` – ${dayMonth(period.to)}` : ""}</span>
              <span className="text-[15px] text-ink">{period.title}</span>
            </li>
          ))}
          <li className={`px-4 py-2.5 text-[14px] leading-relaxed text-ink ${divider}`}>Ամեն չորեքշաբթի և ուրբաթ՝ բացի Զատկից Հոգեգալուստ ընկած օրերից և Սուրբ Ծննդից հետո ութ օրից։</li>
        </ul>
      </section>

      <p className="mx-auto mt-7 mb-0 max-w-[560px] text-center text-[12.5px] leading-relaxed text-muted">
        ⚑ Ճշտել. օրերը հաշվարկված են Զատկից և ստուգվում են Մայր Աթոռի տարեկան տոնացույցով։ Սրբերի տոները դեռ ավելացված չեն։ <Link className="text-gold-bright" to="/church/fasting">Ինչ է պահքը →</Link>
      </p>
    </PageShell>
  );
}
