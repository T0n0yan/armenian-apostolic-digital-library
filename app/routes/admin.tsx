import { env } from "cloudflare:workers";
import { Activity, Ban, Bot, Check, Crown, MonitorSmartphone, RefreshCw, ShieldCheck, UserPlus, Users } from "lucide-react";
import { data, Form, redirect, useNavigation } from "react-router";

import type { Route } from "./+types/admin";
import { createAdminNavigationCookie, requireAdmin, requireSameOrigin } from "../auth/admin.server";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { fieldControl, fieldLabel, panelSection, primaryButton } from "../components/ui-styles";
import {
  getContentChatId,
  getSyncOverview,
  isTelegramUserId,
  listPublishers,
  listSiteAdminCandidates,
  listWithheldAuthors,
  removeManualPublisher,
  setPublisherStatus,
  setSiteAdminRole,
} from "../data/publishers.server";
import { formatArmenianDate } from "../utils/armenian-date";
import { siteStats, type Platform } from "../data/presence.server";
import { bumpCacheEpoch, dispatchCloudSync } from "../data/site-refresh.server";
import { botStatus, connectBot, postGroupWelcome, readGroupWelcome, saveGroupWelcome } from "../data/telegram-bot-replies.server";
import { RouteErrorPage } from "../components/error-page";

export function meta() {
  return [{ title: "Կառավարում — Հոգևոր ժառանգություն" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Someone who typed /admin without access is taken to the library instead of an error.
  const admin = await requireAdmin(request, env.DB).catch((error: unknown) => {
    if (error instanceof Response && (error.status === 401 || error.status === 403)) throw redirect("/");
    throw error;
  });
  const chatId = await getContentChatId(env.DB);
  const [publishers, withheld, siteUsers, sync, stats] = await Promise.all([
    chatId ? listPublishers(env.DB, chatId) : Promise.resolve([]),
    chatId ? listWithheldAuthors(env.DB, chatId) : Promise.resolve([]),
    listSiteAdminCandidates(env.DB),
    chatId ? getSyncOverview(env.DB, chatId) : Promise.resolve(null),
    siteStats(env.DB).catch(() => null),
  ]);
  const bot = await botStatus().catch(() => null);
  const url = new URL(request.url);
  const refreshed = url.searchParams.get("refreshed");
  const isProduction = (env as { PUBLIC_URL?: string }).PUBLIC_URL === "https://apostolic.am";
  return data({ admin, chatId, publishers, withheld, siteUsers, sync, stats, refreshed, bot, botMessage: url.searchParams.get("bot"), welcome: url.searchParams.get("welcome"), welcomeText: await readGroupWelcome(env.DB), isProduction, canSync: Boolean((env as { GITHUB_SYNC_TOKEN?: string }).GITHUB_SYNC_TOKEN) }, {
    headers: { "Set-Cookie": createAdminNavigationCookie(request) },
  });
}

export async function action({ request }: Route.ActionArgs) {
  const admin = await requireAdmin(request, env.DB);
  requireSameOrigin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  // "Կապել բոտը": the bot's messages come to this site (/start, /help replies).
  if (intent === "connect-bot") {
    const result = await connectBot().catch(() => ({ ok: false }));
    return redirect(`/admin?bot=${result.ok ? "connected" : "failed"}`);
  }

  // The group welcome: a preview in the private support group, or the real post (pinned, silent)
  // in the main group. Only production's bot is a member of the main group.
  // The owner's own welcome text («Պահել տեքստը»), or the default back («Վերադարձնել»).
  if (intent === "welcome-save" || intent === "welcome-reset") {
    await saveGroupWelcome(env.DB, intent === "welcome-save" ? String(form.get("text") ?? "") : "");
    return redirect(`/admin?welcome=saved#welcome`);
  }
  if (intent === "welcome-preview" || intent === "welcome-post") {
    const target = intent === "welcome-preview"
      ? (env as { SUPPORT_CHAT_ID?: string }).SUPPORT_CHAT_ID?.trim()
      : await getContentChatId(env.DB);
    // The preview is pinned too (the support group is private), so the owner sees exactly that.
    const result = target ? await postGroupWelcome(target, true, await readGroupWelcome(env.DB)).catch(() => ({ ok: false, description: "" })) : { ok: false, description: "Խումբը չի գտնվել" };
    const outcome = result.ok ? (intent === "welcome-post" ? "posted" : "previewed") : `failed:${result.description ?? ""}`;
    return redirect(`/admin?welcome=${encodeURIComponent(outcome)}#welcome`);
  }

  // "Թարմացնել կայքը": every cached page is rebuilt now, and Telegram is synced again.
  if (intent === "refresh-site") {
    await bumpCacheEpoch(env.DB);
    const synced = await dispatchCloudSync(env as { GITHUB_SYNC_TOKEN?: string; GITHUB_SYNC_REPO?: string }).catch(() => false);
    return redirect(`/admin?refreshed=${synced ? "sync" : "cache"}`);
  }

  if (intent === "site-admin" || intent === "site-member") {
    const userId = form.get("userId");
    if (typeof userId !== "string" || !userId) return data({ error: "Օգտատերը չի գտնվել։" }, { status: 400 });
    if (intent === "site-member") {
      const admins = await env.DB.prepare("SELECT COUNT(*) AS count FROM app_users WHERE role = 'admin'").first<{ count: number }>();
      if ((admins?.count ?? 0) <= 1) return data({ error: "Վերջին ադմինին հնարավոր չէ հեռացնել։" }, { status: 409 });
    }
    await setSiteAdminRole(env.DB, userId, intent === "site-admin" ? "admin" : "member");
    return redirect("/admin?saved=1");
  }

  const chatId = await getContentChatId(env.DB);
  if (!chatId) return data({ error: "Telegram խումբը դեռ համաժամեցված չէ։" }, { status: 409 });
  const telegramUserId = form.get("telegramUserId");
  if (!isTelegramUserId(telegramUserId)) return data({ error: "Telegram ID-ն պետք է լինի թվերից բաղկացած։" }, { status: 400 });
  const displayName = typeof form.get("displayName") === "string" ? String(form.get("displayName")).trim().slice(0, 120) : "";

  if (intent === "publisher-allow" || intent === "publisher-block") {
    await setPublisherStatus(env.DB, {
      chatId, telegramUserId, displayName,
      status: intent === "publisher-allow" ? "allowed" : "blocked",
      addedBy: admin.email,
    });
    return redirect("/admin?saved=1");
  }
  if (intent === "publisher-remove") {
    await removeManualPublisher(env.DB, chatId, telegramUserId);
    return redirect("/admin?saved=1");
  }
  return data({ error: "Անհայտ գործողություն։" }, { status: 400 });
}

const smallButton = "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-glass-border bg-subtle px-3 text-[12px] font-bold text-gold-bright disabled:opacity-60";
const row = "flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-glass-border bg-subtle px-3 py-2.5";

function ActionButton({ intent, telegramUserId, userId, displayName, children, danger = false }: {
  intent: string; telegramUserId?: string; userId?: string; displayName?: string; children: React.ReactNode; danger?: boolean;
}) {
  const navigation = useNavigation();
  return (
    <Form method="post" preventScrollReset>
      <input type="hidden" name="intent" value={intent} />
      {telegramUserId ? <input type="hidden" name="telegramUserId" value={telegramUserId} /> : null}
      {userId ? <input type="hidden" name="userId" value={userId} /> : null}
      {displayName ? <input type="hidden" name="displayName" value={displayName} /> : null}
      <button className={`${smallButton}${danger ? " text-danger" : ""}`} type="submit" disabled={navigation.state !== "idle"}>{children}</button>
    </Form>
  );
}

export default function Admin({ loaderData, actionData }: Route.ComponentProps) {
  const { publishers, withheld, siteUsers, sync, stats, refreshed, canSync, bot, botMessage, welcome, welcomeText, isProduction } = loaderData;
  const navigation = useNavigation();
  const refreshing = navigation.state !== "idle" && navigation.formData?.get("intent") === "refresh-site";
  const error = actionData && "error" in actionData ? actionData.error : null;
  return (
    <PageShell>
      <SiteNav />
      <PageHeader eyebrow="Միայն ադմինների համար" title="Կառավարում" description="Ով կարող է հրապարակել Telegram խմբից կայք, և ով ունի կառավարման հասանելիություն։" />
      {error ? <p className="m-0 mb-3 rounded-[12px] border border-[rgb(239_145_136/35%)] bg-[rgb(239_145_136/10%)] px-3 py-2.5 text-[13px] text-danger" role="alert">{error}</p> : null}

      <div className="grid gap-4">
        <section className={panelSection + " grid gap-3"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 flex items-center gap-2 text-[17px]"><RefreshCw aria-hidden="true" size={19} className="text-gold" /> Թարմացնել կայքը</h2>
            <Form method="post">
              <input type="hidden" name="intent" value="refresh-site" />
              <button className={primaryButton} type="submit" disabled={refreshing}>
                <RefreshCw aria-hidden="true" size={16} className={refreshing ? "animate-search-spin" : ""} /> {refreshing ? "Թարմացվում է…" : "Թարմացնել հիմա"}
              </button>
            </Form>
          </div>
          <p className="m-0 text-[13px] leading-[1.6] text-muted">
            Telegram-ում փոփոխություն անելուց հետո սեղմիր. կայքը կվերցնի նոր տվյալները Telegram-ից{canSync ? "" : " (ավտոմատ համաժամեցումը միացված չէ, կթարմանան միայն պահված էջերը)"}, և բոլոր էջերը կթարմանան։
          </p>
          {refreshed ? (
            <p className="m-0 rounded-[12px] border border-[rgb(74_160_96/40%)] bg-[rgb(74_160_96/10%)] px-3 py-2.5 text-[13px] text-[rgb(52_130_74)]" role="status">
              {refreshed === "sync" ? "✓ Էջերը թարմացված են։ Telegram-ի համաժամեցումը սկսվեց. նոր փոփոխությունները կհայտնվեն 2–5 րոպեում։" : "✓ Էջերը թարմացված են։"}
            </p>
          ) : null}
        </section>

        {stats ? <SiteStats stats={stats} /> : null}

        {bot ? (
          <section className={panelSection + " grid gap-3"}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="m-0 flex items-center gap-2 text-[17px]"><Bot aria-hidden="true" size={19} className="text-gold" /> Telegram բոտ</h2>
              <Form method="post">
                <input type="hidden" name="intent" value="connect-bot" />
                <button className={primaryButton} type="submit">{bot.connected ? "Կրկին կապել" : "Կապել բոտը"}</button>
              </Form>
            </div>
            <p className="m-0 text-[13px] leading-[1.6] text-muted">
              {bot.connected
                ? "✓ Բոտը կապված է այս կայքին. պատասխանում է /start և /help հրամաններին։"
                : "Բոտը դեռ կապված չէ. սեղմիր «Կապել բոտը», որ այն պատասխանի /start և /help հրամաններին։"}
              {bot.lastError ? ` Վերջին սխալը՝ ${bot.lastError}` : ""}
            </p>
            {botMessage ? <p className={`m-0 text-[13px] ${botMessage === "connected" ? "text-[rgb(52_130_74)]" : "text-danger"}`} role="status">{botMessage === "connected" ? "✓ Կապված է։ Գրիր բոտին /start։" : "Չհաջողվեց կապել. ստուգիր TELEGRAM_BOT_TOKEN-ը։"}</p> : null}
          </section>
        ) : null}

        {bot ? (
          <section id="welcome" className={panelSection + " grid gap-3"}>
            <h2 className="m-0 flex items-center gap-2 text-[17px]"><Bot aria-hidden="true" size={19} className="text-gold" /> Ողջույն խմբում</h2>
            <p className="m-0 text-[13px] leading-[1.6] text-muted">
              Բոտը խմբում հրապարակում է այս հաղորդագրությունը «📱 Բացել Telegram-ում», «🌐 Բացել բրաուզերում» և «✉️ Կապ մեզ հետ» կոճակներով և ամրացնում այն՝ առանց ծանուցման։
              Նախ սեղմիր «Նախադիտում». հաղորդագրությունը կգա և կամրացվի միայն Support խմբում։
            </p>
            <Form method="post" className="grid gap-2">
              <textarea className={`${fieldControl} min-h-[320px] resize-y text-[14px] leading-relaxed`} name="text" defaultValue={welcomeText} key={welcomeText} maxLength={4000} aria-label="Ողջույնի տեքստը" />
              <p className="m-0 text-[12px] text-faint">Տեքստը փոխեք այստեղ, սեղմեք «Պահել տեքստը», հետո՝ «Նախադիտում»։ Կոճակները ավելանում են ինքնաբերաբար։</p>
              <div className="flex flex-wrap gap-2">
                <button className={primaryButton} type="submit" name="intent" value="welcome-save">Պահել տեքստը</button>
                <button className="inline-flex min-h-[46px] cursor-pointer items-center rounded-[14px] border border-glass-border bg-subtle px-4 text-[13px] font-semibold text-muted" type="submit" name="intent" value="welcome-reset">Վերադարձնել նախնականը</button>
              </div>
            </Form>
            <div className="flex flex-wrap gap-2">
              <Form method="post"><input type="hidden" name="intent" value="welcome-preview" /><button className={primaryButton} type="submit">Նախադիտում Support խմբում</button></Form>
              {isProduction ? (
                <Form method="post" onSubmit={(event) => { if (!window.confirm("Հրապարակե՞լ և ամրացնել ողջույնը գլխավոր խմբում (առանց ծանուցման)։")) event.preventDefault(); }}>
                  <input type="hidden" name="intent" value="welcome-post" />
                  <button className={primaryButton} type="submit">Հրապարակել գլխավոր խմբում</button>
                </Form>
              ) : <span className="self-center text-[12.5px] text-faint">Գլխավոր խմբում հրապարակել կարելի է միայն apostolic.am-ից։</span>}
            </div>
            {welcome ? (
              <p className={`m-0 text-[13px] ${welcome.startsWith("failed") ? "text-danger" : "text-[rgb(52_130_74)]"}`} role="status">
                {welcome === "posted" ? "✓ Հրապարակվեց և ամրացվեց գլխավոր խմբում։" : welcome === "previewed" ? "✓ Նախադիտումը ուղարկվեց Support խումբ։" : welcome === "saved" ? "✓ Տեքստը պահված է։ Հիմա սեղմեք «Նախադիտում»։" : `Չհաջողվեց. ${welcome.slice(7) || "բոտը խմբում ադմին չէ՞"}`}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className={panelSection + " grid gap-3"}>
          <h2 className="m-0 flex items-center gap-2 text-[17px]"><ShieldCheck aria-hidden="true" size={19} className="text-gold" /> Հրապարակողներ</h2>
          <p className="m-0 text-[13px] leading-[1.6] text-muted">
            Կայքում հայտնվում են միայն այս մարդկանց գրառումները։ Telegram խմբի ադմինները ավելանում են ավտոմատ։
            Ուրիշին թույլ տալու համար գրիր նրա Telegram ID-ն կամ ընտրիր ներքևի ցուցակից։ Փոփոխությունը կայքում երևում է մի քանի րոպեում։
          </p>
          {publishers.length === 0 ? <p className="m-0 text-[13px] text-faint">Դեռ ոչ ոք։ Առաջին համաժամեցումից հետո խմբի ադմինները կհայտնվեն այստեղ։</p> : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {publishers.map((publisher) => (
                <li className={row} key={publisher.telegramUserId}>
                  <span className="grid gap-0.5">
                    <strong className="text-[13px]">{publisher.displayName || publisher.telegramUserId}</strong>
                    <span className="text-[11px] text-faint">
                      {publisher.username ? `@${publisher.username} · ` : ""}ID {publisher.telegramUserId} · {publisher.status === "blocked" ? "արգելված" : publisher.source === "telegram_admin" ? "Telegram ադմին" : "թույլատրված"}
                    </span>
                  </span>
                  <span className="flex gap-1.5">
                    {publisher.status === "blocked"
                      ? <ActionButton intent="publisher-allow" telegramUserId={publisher.telegramUserId}><Check aria-hidden="true" size={14} /> Թույլատրել</ActionButton>
                      : <ActionButton intent="publisher-block" telegramUserId={publisher.telegramUserId} danger><Ban aria-hidden="true" size={14} /> Արգելել</ActionButton>}
                    {publisher.source === "manual" ? <ActionButton intent="publisher-remove" telegramUserId={publisher.telegramUserId}>Հեռացնել</ActionButton> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Form className="grid gap-2 min-[620px]:grid-cols-[1fr_1fr_auto]" method="post">
            <input type="hidden" name="intent" value="publisher-allow" />
            <label className={fieldLabel}>Telegram ID<input className={fieldControl} name="telegramUserId" inputMode="numeric" pattern="(-100)?\d{3,20}" placeholder="123456789" required /></label>
            <label className={fieldLabel}>Անուն (ըստ ցանկության)<input className={fieldControl} name="displayName" maxLength={120} /></label>
            <button className={primaryButton + " self-end"} type="submit"><UserPlus aria-hidden="true" size={16} /> Թույլատրել</button>
          </Form>
        </section>

        <section className={panelSection + " grid gap-3"}>
          <h2 className="m-0 flex items-center gap-2 text-[17px]"><Users aria-hidden="true" size={19} className="text-gold" /> Թաքցված հեղինակներ</h2>
          <p className="m-0 text-[13px] leading-[1.6] text-muted">Այս մարդիկ գրել են խմբում, բայց նրանց գրառումները կայքում չեն երևում։</p>
          {withheld.length === 0 ? <p className="m-0 text-[13px] text-faint">Թաքցված գրառումներ չկան։</p> : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {withheld.map((author) => (
                <li className={row} key={author.telegramUserId}>
                  <span className="grid gap-0.5">
                    <strong className="text-[13px]">{author.displayName || author.telegramUserId}</strong>
                    <span className="text-[11px] text-faint">ID {author.telegramUserId} · {author.withheldCount} թաքցված գրառում{author.lastPostAt ? ` · վերջինը՝ ${formatArmenianDate(author.lastPostAt)}` : ""}</span>
                  </span>
                  <ActionButton intent="publisher-allow" telegramUserId={author.telegramUserId} displayName={author.displayName}><Check aria-hidden="true" size={14} /> Թույլատրել</ActionButton>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={panelSection + " grid gap-3"}>
          <h2 className="m-0 flex items-center gap-2 text-[17px]"><Crown aria-hidden="true" size={19} className="text-gold" /> Կայքի ադմիններ</h2>
          <p className="m-0 text-[13px] leading-[1.6] text-muted">Ադմինները տեսնում են այս էջը։ Ցուցակում են միայն նրանք, ովքեր գոնե մեկ անգամ բացել են mini app-ը։</p>
          <ul className="m-0 grid list-none gap-2 p-0">
            {siteUsers.map((user) => (
              <li className={row} key={user.id}>
                <span className="grid gap-0.5">
                  <strong className="text-[13px]">{user.displayName}{user.role === "admin" ? " · ադմին" : ""}</strong>
                  <span className="text-[11px] text-faint">{user.username ? `@${user.username} · ` : ""}ID {user.telegramId}</span>
                </span>
                {user.role === "admin"
                  ? <ActionButton intent="site-member" userId={user.id} danger>Հանել ադմինից</ActionButton>
                  : <ActionButton intent="site-admin" userId={user.id}>Դարձնել ադմին</ActionButton>}
              </li>
            ))}
          </ul>
        </section>

        {sync ? (
          <section className={panelSection + " grid gap-2"}>
            <h2 className="m-0 flex items-center gap-2 text-[17px]"><Activity aria-hidden="true" size={19} className="text-gold" /> Համաժամեցում</h2>
            <p className="m-0 text-[13px] text-muted">Կայքում՝ {sync.readyMaterials} նյութ{sync.pendingFailures > 0 ? ` · ${sync.pendingFailures} չստացված ֆայլ` : ""}</p>
            {sync.lastRun ? (
              <p className="m-0 text-[13px] text-muted">
                Վերջին համաժամեցումը՝ {new Date(sync.lastRun.startedAt).toLocaleString("hy-AM", { timeZone: "Asia/Yerevan" })} · {sync.lastRun.status === "complete" ? "հաջող" : sync.lastRun.status === "running" ? "ընթացքում" : "սխալներով"}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}

const PLATFORM_NAMES: Record<Platform, string> = { ios: "iPhone / iPad", android: "Android", windows: "Windows", macos: "Mac", linux: "Linux", other: "Այլ" };

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="grid gap-0.5 rounded-[14px] border border-glass-border bg-subtle px-3 py-2.5">
      <span className="text-[11.5px] text-muted">{label}</span>
      <strong className="text-[22px] leading-tight text-ink tabular-nums">{value}</strong>
      {note ? <span className="text-[11px] text-faint">{note}</span> : null}
    </div>
  );
}

/** Accounts (Telegram / Google), devices of the last 30 days, and how many are on the site right now. */
function SiteStats({ stats }: { stats: NonNullable<Route.ComponentProps["loaderData"]["stats"]> }) {
  const deviceTotal = stats.devices.reduce((sum, row) => sum + row.count, 0);
  return (
    <section className={panelSection + " grid gap-4"}>
      <h2 className="m-0 flex items-center gap-2 text-[17px]"><Users aria-hidden="true" size={19} className="text-gold" /> Օգտատերեր</h2>
      <div className="grid grid-cols-2 gap-2 min-[620px]:grid-cols-4">
        <Stat label="Գրանցված" value={stats.accounts.total} note={`+${stats.accounts.week} այս շաբաթ`} />
        <Stat label="Telegram-ով" value={stats.accounts.telegram} />
        <Stat label="Google-ով" value={stats.accounts.google} />
        <Stat label="Հիմա կայքում" value={stats.online.total} note="վերջին 7 րոպեում" />
      </div>

      <div className="grid gap-2">
        <h3 className="m-0 flex items-center gap-2 text-[14px]"><MonitorSmartphone aria-hidden="true" size={16} className="text-gold" /> Սարքեր՝ վերջին 30 օրում</h3>
        {deviceTotal === 0 ? <p className="m-0 text-[12.5px] text-faint">Դեռ տվյալ չկա։</p> : (
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {stats.devices.map((row) => (
              <li key={row.platform} className="grid grid-cols-[110px_1fr_auto] items-center gap-2.5 text-[12.5px]">
                <span className="text-ink">{PLATFORM_NAMES[row.platform]}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-subtle"><span className="block h-full rounded-full bg-[linear-gradient(90deg,#b07d2e,#e2c27e)]" style={{ width: `${Math.max(3, (row.count / deviceTotal) * 100)}%` }} /></span>
                <span className="tabular-nums text-muted">{row.count} · {Math.round((row.count / deviceTotal) * 100)}%{row.telegram ? ` · ${row.telegram} Telegram-ում` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

    </section>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
