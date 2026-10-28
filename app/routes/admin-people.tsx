import { env } from "cloudflare:workers";
import { Download, LoaderCircle, MonitorSmartphone, Search, Users } from "lucide-react";
import { useState } from "react";
import { Form, Link, redirect } from "react-router";

import type { Route } from "./+types/admin-people";
import { requirePermission } from "../auth/admin.server";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { fieldControl, panelSection } from "../components/ui-styles";
import { RouteErrorPage } from "../components/error-page";
import { listDevices, listPeople } from "../data/people.server";
import { EXPORT_PAGE_SIZE, PAGE_SIZE } from "../data/people";
import type { Platform } from "../data/presence.server";
import { buildXlsx, saveFile, type Cell } from "../utils/xlsx";

export function meta() {
  return [{ title: "Մարդիկ — Կառավարում" }, { name: "robots", content: "noindex, nofollow" }];
}

const PLATFORM_NAMES: Record<Platform, string> = { ios: "iPhone / iPad", android: "Android", windows: "Windows", macos: "Mac", linux: "Linux", other: "Այլ" };
const PLATFORMS = Object.keys(PLATFORM_NAMES) as Platform[];

type Tab = "people" | "devices";

function readOptions(url: URL) {
  const tab: Tab = url.searchParams.get("tab") === "devices" ? "devices" : "people";
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const platformValue = url.searchParams.get("platform");
  const platform = platformValue && PLATFORMS.includes(platformValue as Platform) ? platformValue as Platform : null;
  const page = Math.max(1, Math.min(10_000, Number(url.searchParams.get("page")) || 1));
  return { tab, query, platform, page };
}

export async function loader({ request }: Route.LoaderArgs) {
  await requirePermission(request, env.DB, "people").catch((error: unknown) => {
    if (error instanceof Response && (error.status === 401 || error.status === 403)) throw redirect("/");
    throw error;
  });
  const options = readOptions(new URL(request.url));
  const offset = (options.page - 1) * PAGE_SIZE;
  const [people, devices] = await Promise.all([
    options.tab === "people" ? listPeople(env.DB, { query: options.query, offset, limit: PAGE_SIZE }) : null,
    options.tab === "devices" ? listDevices(env.DB, { platform: options.platform, offset, limit: PAGE_SIZE }) : null,
  ]);
  return { ...options, people, devices };
}

/** "2026-10-24T01:02:03Z" → "24.10.2026 05:02" (Yerevan time, UTC+4 all year). */
function yerevanTime(iso: string | null) {
  if (!iso) return "";
  const date = new Date(Date.parse(iso) + 4 * 3_600_000);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function accountKind(telegramId: string) {
  return telegramId.startsWith("google:") ? "Google" : "Telegram";
}

/** Fetches every row in pieces (each request cheap for the server) and builds the Excel file here. */
async function exportAll(tab: Tab, query: string, platform: Platform | null, onProgress: (count: number) => void) {
  const rows: Cell[][] = [];
  for (let offset = 0; offset < 500_000; offset += EXPORT_PAGE_SIZE) {
    const url = new URL("/admin/people/export", window.location.origin);
    url.searchParams.set("tab", tab);
    url.searchParams.set("offset", String(offset));
    if (query) url.searchParams.set("q", query);
    if (platform) url.searchParams.set("platform", platform);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`export ${response.status}`);
    const page = await response.json() as { rows: Cell[][] };
    rows.push(...page.rows);
    onProgress(rows.length);
    if (page.rows.length < EXPORT_PAGE_SIZE) break;
  }
  const today = new Date().toISOString().slice(0, 10);
  if (tab === "people") {
    saveFile(buildXlsx("Գրանցվածներ", ["Անուն", "Username", "Մուտք", "Telegram ID", "Դեր", "Գրանցվել է", "Վերջին այց"],
      rows.map(([name, username, telegramId, role, created, seen]) => [
        name, username ? `@${username}` : "", accountKind(String(telegramId)), String(telegramId).startsWith("google:") ? "" : telegramId,
        role === "admin" ? "ադմին" : "", yerevanTime(created as string), yerevanTime(seen as string),
      ]), [28, 20, 12, 16, 10, 18, 18]), `grancvacner-${today}.xlsx`);
  } else {
    saveFile(buildXlsx("Այցելուներ", ["Համակարգ", "Telegram-ից", "Առաջին այց", "Վերջին այց"],
      rows.map(([platformName, inTelegram, first, last]) => [
        PLATFORM_NAMES[platformName as Platform] ?? String(platformName), inTelegram ? "այո" : "", yerevanTime(first as string), yerevanTime(last as string),
      ]), [16, 12, 18, 18]), `aycelur-sarqer-${today}.xlsx`);
  }
}

function pageHref(options: { tab: Tab; query: string; platform: Platform | null }, page: number) {
  const parameters = new URLSearchParams({ tab: options.tab });
  if (options.query) parameters.set("q", options.query);
  if (options.platform) parameters.set("platform", options.platform);
  if (page > 1) parameters.set("page", String(page));
  return `/admin/people?${parameters}`;
}

export default function AdminPeople({ loaderData }: Route.ComponentProps) {
  const { tab, query, platform, page, people, devices } = loaderData;
  const [exporting, setExporting] = useState<number | null>(null);
  const [exportError, setExportError] = useState(false);
  const total = (tab === "people" ? people?.total : devices?.total) ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const row = "grid gap-0.5 rounded-[14px] border border-glass-border bg-subtle px-3 py-2.5 text-[12.5px]";
  const tabClass = (active: boolean) => `inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[11px] text-[13px] font-bold no-underline ${active ? "bg-[var(--page-bg)] text-gold-bright shadow-card" : "text-muted"}`;

  const download = async () => {
    setExportError(false);
    setExporting(0);
    try { await exportAll(tab, query, platform, setExporting); } catch { setExportError(true); }
    setExporting(null);
  };

  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/admin" backLabel="Կառավարում" eyebrow="Միայն ադմինների համար" title="Մարդիկ" description="Գրանցված ընթերցողները և առանց մուտքի այցելած սարքերը (անանուն)։" showSearch={false} />
      <section className={`${panelSection} grid gap-4`}>
        <nav className="grid grid-cols-2 gap-1.5 rounded-[14px] bg-subtle p-1" aria-label="Ցուցակ">
          <Link className={tabClass(tab === "people")} to="/admin/people"><Users aria-hidden="true" size={16} /> Գրանցվածներ</Link>
          <Link className={tabClass(tab === "devices")} to="/admin/people?tab=devices"><MonitorSmartphone aria-hidden="true" size={16} /> Այցելուներ</Link>
        </nav>

        <Form className="flex flex-wrap items-center gap-2" method="get">
          <input type="hidden" name="tab" value={tab} />
          {tab === "people" ? (
            <input className={`${fieldControl} min-w-0 flex-1`} type="search" name="q" defaultValue={query} placeholder="Անուն, @username կամ ID" aria-label="Որոնել" />
          ) : (
            <select className={`${fieldControl} min-w-0 flex-1`} name="platform" defaultValue={platform ?? ""} aria-label="Համակարգ">
              <option value="">Բոլոր համակարգերը</option>
              {PLATFORMS.map((value) => <option key={value} value={value}>{PLATFORM_NAMES[value]}</option>)}
            </select>
          )}
          <button className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[12px] border-0 bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] px-4 text-[13px] font-bold text-[#2a1708]" type="submit">
            <Search aria-hidden="true" size={16} /> {tab === "people" ? "Գտնել" : "Ցույց տալ"}
          </button>
        </Form>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] text-muted">{total} {tab === "people" ? "մարդ" : "սարք"}{query ? `՝ «${query}»` : ""}</span>
          <button className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-[rgb(217_181_111/40%)] bg-transparent px-3.5 text-[12.5px] font-bold text-gold-bright disabled:opacity-60" type="button" onClick={download} disabled={exporting !== null || total === 0}>
            {exporting !== null ? <LoaderCircle aria-hidden="true" size={15} className="animate-search-spin" /> : <Download aria-hidden="true" size={15} />}
            {exporting !== null ? `Պատրաստվում է… ${exporting}` : "Ներբեռնել Excel"}
          </button>
        </div>
        {exportError ? <p className="m-0 text-[12.5px] text-[#b4472f]" role="alert">Չհաջողվեց պատրաստել ֆայլը։ Փորձեք նորից։</p> : null}

        <ul className="m-0 grid list-none gap-1.5 p-0">
          {tab === "people" ? people?.people.map((person) => (
            <li className={row} key={person.id}>
              <strong className="text-[13.5px] text-ink">{person.displayName}{person.role === "admin" ? " · ադմին" : ""}</strong>
              <span className="text-faint">
                {accountKind(person.telegramId)}{person.username ? ` · @${person.username}` : ""}{person.telegramId.startsWith("google:") ? "" : ` · ID ${person.telegramId}`}
              </span>
              <span className="text-faint">Գրանցվել է՝ {yerevanTime(person.createdAt)} · Վերջին այց՝ {yerevanTime(person.lastSeenAt)}</span>
            </li>
          )) : devices?.devices.map((device, index) => (
            <li className={row} key={`${device.firstSeen}-${index}`}>
              <strong className="text-[13.5px] text-ink">{PLATFORM_NAMES[device.platform]}{device.inTelegram ? " · Telegram-ից" : ""}</strong>
              <span className="text-faint">Առաջին այց՝ {yerevanTime(device.firstSeen)}</span>
            </li>
          ))}
          {total === 0 ? <li className="text-[13px] text-faint">{query ? "Ոչ ոք չգտնվեց։" : "Դեռ ոչ ոք չկա։"}</li> : null}
        </ul>

        {pages > 1 ? (
          <nav className="flex items-center justify-between gap-2 text-[13px]" aria-label="Էջեր">
            {page > 1 ? <Link className="font-bold text-gold-bright no-underline" to={pageHref(loaderData, page - 1)}>← Նախորդ</Link> : <span />}
            <span className="text-muted">{page} / {pages}</span>
            {page < pages ? <Link className="font-bold text-gold-bright no-underline" to={pageHref(loaderData, page + 1)}>Հաջորդ →</Link> : <span />}
          </nav>
        ) : null}
      </section>
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
