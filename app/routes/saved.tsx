import { env } from "cloudflare:workers";
import { BookOpenCheck, Bookmark, ChevronDown, Highlighter, Search } from "lucide-react";
import { memo, useCallback, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router";

import type { Route } from "./+types/saved";
import {
  getTelegramUserState,
  requireSameOriginUserRequest,
  requireTelegramUser,
  upsertAppUser,
} from "../auth/telegram-user.server";
import { CategoryIcon } from "../components/category-icon";
import { googleConfig } from "../auth/google.server";
import { readingDays } from "../data/reading-log.server";
import { ReadingCalendar } from "../components/reading-calendar";
import { MyYearLinks } from "../components/my-year-links";
import { MaterialResultCard } from "../components/material-result-card";
import { cardVariantFor } from "../utils/card-variant";
import { EmptyState, PageShell, RouteErrorState } from "../components/page-layout";
import {
  MY_CORNER_IMAGE,
  SectionHeader,
} from "../components/section-header";
import { SiteNav } from "../components/site-nav";
import { countBadge, sectionHeader, sectionTitle } from "../components/ui-styles";
import {
  groupSavedMaterials,
  listSavedMaterials,
  setMaterialSaved,
  type SavedMaterialGroup,
} from "../data/saved-materials.server";
import { getCloudLibraryPost } from "../data/cloud-library.server";
import { listHighlights } from "../data/highlights.server";
import type { Highlight } from "../utils/highlights";
import { NotesPanel } from "../components/notes-panel";
import { parseMaterialId } from "../../shared/telegram-bridge-contract";
import { useSavedMaterials } from "../hooks/use-saved-materials";
import { RouteErrorPage } from "../components/error-page";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Իմ անկյունը — Հոգևոր ժառանգություն" },
    { name: "robots", content: "noindex, nofollow, noarchive" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const query = (new URL(request.url).searchParams.get("q") ?? "")
    .trim()
    .slice(0, 120);
  const auth = await getTelegramUserState(request);
  const user = auth.user;
  const googleAvailable = Boolean(googleConfig());
  const signInFailed = new URL(request.url).searchParams.get("signin") === "failed";
  if (!user) return { user: null, authStatus: auth.status, errorKind: null, groups: [], query, total: 0, googleAvailable, signInFailed };
  try {
    await upsertAppUser(env.DB, user);
  } catch {
    console.error(JSON.stringify({ event: "saved_loader_error", kind: "database" }));
    return { user, authStatus: auth.status, errorKind: "database" as const, groups: [], query, total: 0, googleAvailable, signInFailed };
  }
  let materials;
  const [readingLog, joinedAt, notes] = await Promise.all([
    readingDays(env.DB, user.id).catch(() => ({} as Record<string, number>)),
    env.DB.prepare("SELECT created_at FROM app_users WHERE id = ?").bind(user.id).first<{ created_at: string }>().then((row) => row?.created_at ?? null).catch(() => null),
    listHighlights(env.DB, user.id).then((highlights) => ({ highlights, failed: false })).catch(() => ({ highlights: [] as Highlight[], failed: true })),
  ]);
  try {
    materials = await listSavedMaterials(env.DB, user.id, query, undefined, request.signal);
  } catch (error) {
    if (request.signal.aborted) throw error;
    const errorKind = "database" as const;
    console.error(JSON.stringify({ event: "saved_loader_error", kind: errorKind }));
    return { user, authStatus: auth.status, errorKind, groups: [], query, total: 0, googleAvailable, signInFailed };
  }
  return {
    user,
    authStatus: auth.status,
    errorKind: null,
    groups: groupSavedMaterials(materials),
    query,
    total: materials.length,
    googleAvailable,
    signInFailed,
    readingLog,
    joinedAt,
    notes,
  };
}

export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const materialId = formData.get("materialId");
  const personalNote = formData.get("personalNote");
  if (
    (intent !== "save" && intent !== "remove") ||
    typeof materialId !== "string" ||
    !parseMaterialId(materialId) ||
    typeof personalNote !== "string" ||
    Array.from(personalNote).length > 160
  ) {
    return Response.json({ saved: false, error: "invalid-request" }, { status: 400 });
  }

  await upsertAppUser(env.DB, user);
  const reference = parseMaterialId(materialId)!;
  if (intent === "save" && !(await getCloudLibraryPost(env.DB, reference.chatId, reference.messageId))) {
    return Response.json({ saved: false, error: "material-unavailable" }, { status: 404 });
  }
  const saved = await setMaterialSaved(
    env.DB,
    user.id,
    materialId,
    intent === "save",
    personalNote,
  );
  return Response.json({ saved });
}

const SavedGroup = memo(function SavedGroup({ group, open, query }: {
  group: SavedMaterialGroup;
  open: boolean;
  query: string;
}) {
  const { materials } = group;
  const savedMaterialIds = useMemo(
    () => materials.map((material) => material.id),
    [materials],
  );
  const { isSaving, pendingMaterialId, savedIds, setSaved } =
    useSavedMaterials(savedMaterialIds);
  const handleSavedChange = useCallback(
    (materialId: string, saved: boolean, personalNote = "") =>
      setSaved(materialId, saved, personalNote),
    [setSaved],
  );

  return (
    <details className="group overflow-hidden frosted-panel animate-glass-enter" open={open}>
      <summary className="grid min-h-[66px] cursor-pointer list-none grid-cols-[34px_minmax(0,1fr)_auto_20px] items-center gap-2.5 px-[13px] py-[11px] outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[rgb(217_181_111/42%)]">
        <CategoryIcon categoryId={group.categoryId} categoryName={group.categoryName} size={20} strokeWidth={1.8} />
        <span className="grid gap-0.5">
          <strong className="text-[13px]">{group.categoryName}</strong>
          <small className="text-[11px] text-faint">{materials.length} պահված նյութ</small>
        </span>
        <span className="grid h-8 min-w-8 place-items-center rounded-full border border-glass-border px-2 text-[12px] text-gold-bright tabular-nums">{materials.length}</span>
        <ChevronDown className="text-gold transition-transform duration-[180ms] group-open:rotate-180" aria-hidden="true" size={18} />
      </summary>
      <ol className="m-0 grid list-none gap-2.5 px-[9px] pb-[9px]">
        {materials.map((material) => (
          <MaterialResultCard
            key={material.id}
            material={material}
            highlightQuery={query}
            variant={cardVariantFor(material)}
            canSave
            isSaved={savedIds.has(material.id)}
            isSaving={isSaving && pendingMaterialId === material.id}
            allowNoteEditing
            onSavedChange={handleSavedChange}
          />
        ))}
      </ol>
    </details>
  );
});

type CornerTab = "saved" | "reading" | "notes";
const TAB_KEY = "corner-tab";
const CORNER_TABS: Array<{ id: CornerTab; label: string; icon: typeof Bookmark }> = [
  { id: "saved", label: "Պահված նյութեր", icon: Bookmark },
  { id: "reading", label: "Իմ ընթերցանությունը", icon: BookOpenCheck },
  { id: "notes", label: "Իմ նշումները", icon: Highlighter },
];
const TAB_HINTS: Record<CornerTab, string> = {
  saved: "🔖 Ամբողջ նյութեր, որ պահել եք՝ նորից կարդալու համար։",
  reading: "📖 Ինչ և երբ եք կարդացել, Ձեր տարին և ամիսը։",
  notes: "",
};
function isCornerTab(value: string | null): value is CornerTab {
  return value === "saved" || value === "reading" || value === "notes";
}

/** «Իմ անկյունը»-ի 3 ներդիրը. նշումների վրա՝ նաև պատասխանի սպասող հարցերի թիվը։ */
function CornerTabs({ tab, onChoose, notes, saved }: { tab: CornerTab; onChoose: (tab: CornerTab) => void; notes: Highlight[]; saved: number }) {
  const questions = notes.filter((item) => item.kind === "question" && !item.answeredAt).length;
  const count: Record<CornerTab, string> = { saved: saved ? String(saved) : "", reading: "", notes: notes.length ? String(notes.length) : "" };
  return (
    <div className="grid grid-cols-3 gap-1 rounded-[18px] border border-glass-border bg-subtle p-1" role="tablist" aria-label="Իմ անկյունը">
      {CORNER_TABS.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => onChoose(id)}
          className={`relative grid min-h-[58px] cursor-pointer justify-items-center gap-0.5 rounded-[14px] border-0 px-1 py-1.5 text-[12px] leading-tight font-semibold ${tab === id ? "bg-[var(--page-bg)] text-gold-bright shadow-card" : "bg-transparent text-muted"}`}>
          <Icon aria-hidden="true" size={18} strokeWidth={1.9} />
          <span>{label}{count[id] ? <span className="ml-1 tabular-nums opacity-70">{count[id]}</span> : null}</span>
          {id === "notes" && questions ? <span className="absolute top-1 right-1.5 rounded-full bg-[rgb(120_165_230/22%)] px-1.5 text-[10.5px] font-bold text-[rgb(70_120_200)]">❓ {questions}</span> : null}
        </button>
      ))}
    </div>
  );
}

export default function Saved({ loaderData }: Route.ComponentProps) {
  const [params, setParams] = useSearchParams();
  const tab: CornerTab = loaderData.query ? "saved" : isCornerTab(params.get("tab")) ? params.get("tab") as CornerTab : "saved";
  const chooseTab = useCallback((next: CornerTab) => {
    try { localStorage.setItem(TAB_KEY, next); } catch { /* պահեստը փակ է */ }
    setParams(next === "saved" ? {} : { tab: next }, { replace: true, preventScrollReset: true });
  }, [setParams]);
  // Վերջին բացած ներդիրը՝ եթե հասցեում ներդիր չկա։
  useEffect(() => {
    if (params.get("tab") || loaderData.query) return;
    let last: string | null = null;
    try { last = localStorage.getItem(TAB_KEY); } catch { /* պահեստը փակ է */ }
    if (isCornerTab(last) && last !== "saved") setParams({ tab: last }, { replace: true, preventScrollReset: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <PageShell>
      <SiteNav />
      <SectionHeader
        backTo="/"
        backLabel="Գրադարան"
        imageSrc={MY_CORNER_IMAGE}
        title="Իմ անկյունը"
        query={loaderData.query}
        searchAction="/saved"
        searchLabel="Փնտրել իմ պահած նյութերում"
        searchPlaceholder="Փնտրել իմ պահած նյութերում…"
        showSearch={Boolean(loaderData.user) && tab === "saved"}
      />

      {loaderData.errorKind ? (
        <RouteErrorState
          title="Պահված նյութերը չհաջողվեց բեռնել"
          description="Տվյալների պահոցի հետ կապը չհաջողվեց։ Փորձիր կրկին։"
        />
      ) : !loaderData.user ? (
        // Sign-in: a centred card whose buttons keep a phone's width on wide screens too.
        <section className="frosted-panel grid justify-items-center gap-3 px-5 py-7 text-center min-[560px]:px-10 min-[560px]:py-9">
          <span className="grid size-12 place-items-center rounded-full border border-[rgb(217_181_111/30%)] bg-[rgb(217_181_111/10%)] text-gold-bright"><Bookmark aria-hidden="true" size={24} strokeWidth={1.7} /></span>
          <h2 className="m-0 max-w-[420px] font-noto text-[17px] leading-snug text-ink">{loaderData.authStatus === "invalid" ? "Մուտքը դադարել է" : "Մուտք «Իմ անկյունը»"}</h2>
          <p className="m-0 max-w-[420px] text-[13px] leading-[1.6] text-muted">{loaderData.authStatus === "invalid"
            // «Ելք բոլոր սարքերից» կամ ժամկետը. նույն կոճակներով նորից մտնել (Mini App-ում մուտքը նորից ավտոմատ է)։
            ? "Դուք դուրս եք եկել (օր.՝ «Ելք բոլոր սարքերից»), կամ մուտքի ժամկետն ավարտվել է։ Մտեք նորից։"
            : loaderData.authStatus === "unavailable"
              ? "Telegram նույնականացումը այս միջավայրում կազմաձևված չէ։"
              : "Մտիր, որ պահես նյութեր և համարներ, գրես նշումներ և դնես հիշեցումներ։ Telegram Mini App-ում մուտքն ավտոմատ է։"}</p>
          {loaderData.signInFailed ? <p className="m-0 text-[12.5px] text-[#b4472f]" role="alert">Google-ով մուտքը չհաջողվեց։ Փորձիր նորից։</p> : null}
          {loaderData.authStatus === "guest" || loaderData.authStatus === "invalid" ? (
            <div className="mt-1 grid w-full max-w-[320px] gap-2">
              {loaderData.googleAvailable ? (
                <a className="flex min-h-12 w-full items-center justify-center gap-3 rounded-[14px] border border-glass-border bg-[var(--page-bg)] px-3.5 text-[14px] font-semibold text-ink no-underline shadow-card" href="/auth/google?return=/saved">
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                  Մուտք Google-ով
                </a>
              ) : null}
              {/* Telegram's own sign-in page; the same account as in the Mini App. */}
              <a className="flex min-h-12 w-full items-center justify-center gap-3 rounded-[14px] border border-glass-border bg-[var(--page-bg)] px-3.5 text-[14px] font-semibold text-ink no-underline shadow-card" href="/auth/telegram/start?return=/saved">
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#2AABEE" /><path fill="#fff" d="M5.4 11.8l11.6-4.5c.54-.2 1 .13.83.94l-1.98 9.3c-.15.66-.54.82-1.1.51l-3-2.22-1.45 1.4c-.16.16-.3.3-.6.3l.21-3.05 5.56-5.02c.24-.21-.05-.33-.38-.12l-6.87 4.33-2.96-.92c-.64-.2-.66-.64.14-.95z" /></svg>
                  Մուտք Telegram-ով
              </a>
              {!loaderData.googleAvailable ? <span className="text-[11.5px] text-faint">Google-ով մուտքը շուտով կմիանա։</span> : null}
              <Link className="min-h-11 inline-flex items-center justify-center text-sm text-gold-bright" to="/">Չեղարկել և վերադառնալ գրադարան</Link>
              <Link className="mt-1 justify-self-center text-[11.5px] text-faint underline" to="/privacy">Գաղտնիության քաղաքականություն</Link>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="grid gap-3" aria-labelledby="saved-title">
          <CornerTabs tab={tab} onChoose={chooseTab} notes={"notes" in loaderData ? loaderData.notes.highlights : []} saved={loaderData.total} />
          {TAB_HINTS[tab] ? <p className="m-0 -mt-1 px-1 text-[12.5px] leading-snug text-faint">{TAB_HINTS[tab]}</p> : null}

          {tab === "reading" ? (
            <>
              {"readingLog" in loaderData && loaderData.readingLog ? <ReadingCalendar days={loaderData.readingLog} joinedAt={"joinedAt" in loaderData ? loaderData.joinedAt ?? null : null} /> : null}
              <MyYearLinks />
            </>
          ) : tab === "notes" ? (
            <NotesPanel highlights={"notes" in loaderData ? loaderData.notes.highlights : []} failed={"notes" in loaderData ? loaderData.notes.failed : false} />
          ) : (
          <>
          <div className={sectionHeader}>
            <h2 className={sectionTitle} id="saved-title">
              {loaderData.query ? "Գտնված նյութեր" : "Պահված նյութեր"}
            </h2>
            <span className={countBadge}>{loaderData.total}</span>
          </div>
          {loaderData.total === 0 && !loaderData.query ? (
            <EmptyState icon={<Bookmark aria-hidden="true" size={28} strokeWidth={1.6} />} title="Դեռ ոչինչ չես պահել">
              <p>Նյութի կողքի նշանը սեղմիր, և այն կհայտնվի այստեղ։</p>
              <Link className="mt-[7px] inline-flex items-center gap-1.5 rounded-[11px] border border-[rgb(217_181_111/24%)] bg-[rgb(217_181_111/8%)] px-3 py-[9px] text-[12px] font-[720] text-gold-bright no-underline" to="/search">
                <Search aria-hidden="true" size={17} /> Գտնել նյութ
              </Link>
            </EmptyState>
          ) : loaderData.groups.length === 0 ? (
            <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-[13px] gap-y-[11px] frosted-panel p-4 text-muted [&>a]:col-start-2 [&>a]:w-fit [&>a]:text-[12px] [&>a]:font-[740] [&>a]:text-gold-bright [&>a]:no-underline [&_h2]:m-0 [&_h2]:text-[15px] [&_h2]:leading-[1.45] [&_h2]:text-ink [&_p]:m-0 [&_p]:text-[12px] [&_p]:leading-[1.5]">
              <span className="grid size-11 place-items-center rounded-[14px] border border-[rgb(217_181_111/22%)] bg-[rgb(217_181_111/8%)] text-gold-bright" aria-hidden="true">
                <Search size={22} strokeWidth={1.7} />
              </span>
              <div className="grid gap-1">
                <h2>«{loaderData.query}» բառով նյութ չկա</h2>
                <p>Փորձիր վերնագրից, նյութի տեքստից կամ քո նշումից ուրիշ բառ։</p>
              </div>
              <Link to="/saved">Ցույց տալ բոլոր պահվածները</Link>
            </div>
          ) : (
            <div className="grid gap-2.5">
              {loaderData.groups.map((group) => (
                <SavedGroup
                  key={group.categorySlug}
                  group={group}
                  open={Boolean(loaderData.query)}
                  query={loaderData.query}
                />
              ))}
            </div>
          )}
          </>
          )}
          {loaderData.user?.source === "google" ? (
            // Joining moves this account's saved items to the Telegram account, so the Mini App shows them too.
            <div className="mt-4 grid gap-2 border-t border-glass-border px-1 pt-4">
              <a className="flex min-h-11 items-center justify-center gap-2 rounded-[14px] border border-glass-border bg-subtle px-3 text-[13px] font-bold text-ink no-underline" href="/auth/telegram/start?return=/saved">
                Կապել Telegram հաշիվս
              </a>
              <p className="m-0 text-[11.5px] leading-snug text-faint">Կապելուց հետո պահածներդ, նշումներդ և հիշեցումներդ նույնը կլինեն թե՛ կայքում, թե՛ Telegram-ի Mini App-ում։</p>
            </div>
          ) : null}
        </section>
      )}
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
