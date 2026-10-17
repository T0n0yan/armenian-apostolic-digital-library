import { env } from "cloudflare:workers";
import { Activity, Ban, Check, Crown, ShieldCheck, UserPlus, Users } from "lucide-react";
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

export function meta() {
  return [{ title: "Կառավարում — Հոգևոր ժառանգություն" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request, env.DB);
  const chatId = await getContentChatId(env.DB);
  const [publishers, withheld, siteUsers, sync] = await Promise.all([
    chatId ? listPublishers(env.DB, chatId) : Promise.resolve([]),
    chatId ? listWithheldAuthors(env.DB, chatId) : Promise.resolve([]),
    listSiteAdminCandidates(env.DB),
    chatId ? getSyncOverview(env.DB, chatId) : Promise.resolve(null),
  ]);
  return data({ admin, chatId, publishers, withheld, siteUsers, sync }, {
    headers: { "Set-Cookie": createAdminNavigationCookie(request) },
  });
}

export async function action({ request }: Route.ActionArgs) {
  const admin = await requireAdmin(request, env.DB);
  requireSameOrigin(request);
  const form = await request.formData();
  const intent = form.get("intent");

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
  const { publishers, withheld, siteUsers, sync } = loaderData;
  const error = actionData && "error" in actionData ? actionData.error : null;
  return (
    <PageShell>
      <SiteNav />
      <PageHeader eyebrow="Միայն ադմինների համար" title="Կառավարում" description="Ով կարող է հրապարակել Telegram խմբից կայք, և ով ունի կառավարման հասանելիություն։" />
      {error ? <p className="m-0 mb-3 rounded-[12px] border border-[rgb(239_145_136/35%)] bg-[rgb(239_145_136/10%)] px-3 py-2.5 text-[13px] text-danger" role="alert">{error}</p> : null}

      <div className="grid gap-4">
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

export function ErrorBoundary() {
  return <PageShell><SiteNav /><PageHeader eyebrow="Միայն ադմինների համար" title="Կառավարման էջը հասանելի չէ" /></PageShell>;
}
