import { env } from "cloudflare:workers";
import { Bookmark, ChevronDown, Search } from "lucide-react";
import { memo, useCallback, useMemo } from "react";
import { Link } from "react-router";

import type { Route } from "./+types/saved";
import {
  getTelegramUserState,
  requireSameOriginUserRequest,
  requireTelegramUser,
  upsertAppUser,
} from "../auth/telegram-user.server";
import { CategoryIcon } from "../components/category-icon";
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
import { parseMaterialId } from "../../shared/telegram-bridge-contract";
import { useSavedMaterials } from "../hooks/use-saved-materials";

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
  if (!user) return { user: null, authStatus: auth.status, errorKind: null, groups: [], query, total: 0 };
  try {
    await upsertAppUser(env.DB, user);
  } catch {
    console.error(JSON.stringify({ event: "saved_loader_error", kind: "database" }));
    return { user, authStatus: auth.status, errorKind: "database" as const, groups: [], query, total: 0 };
  }
  let materials;
  try {
    materials = await listSavedMaterials(env.DB, user.id, query, undefined, request.signal);
  } catch (error) {
    if (request.signal.aborted) throw error;
    const errorKind = "database" as const;
    console.error(JSON.stringify({ event: "saved_loader_error", kind: errorKind }));
    return { user, authStatus: auth.status, errorKind, groups: [], query, total: 0 };
  }
  return {
    user,
    authStatus: auth.status,
    errorKind: null,
    groups: groupSavedMaterials(materials),
    query,
    total: materials.length,
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
            typicalType="poll"
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

export default function Saved({ loaderData }: Route.ComponentProps) {
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
        showSearch={Boolean(loaderData.user)}
      />

      {loaderData.errorKind ? (
        <RouteErrorState
          title="Պահված նյութերը չհաջողվեց բեռնել"
          description="Տվյալների պահոցի հետ կապը չհաջողվեց։ Փորձիր կրկին։"
        />
      ) : !loaderData.user ? (
        <EmptyState icon={<Bookmark aria-hidden="true" size={28} strokeWidth={1.6} />} title={loaderData.authStatus === "invalid" ? "Telegram նույնականացման ժամկետն ավարտվել է" : "Իմ անկյունը հասանելի է Telegram-ում"}>
          <p>{loaderData.authStatus === "invalid"
            ? "Փակիր և նորից բացիր Mini App-ը Telegram-ից։"
            : loaderData.authStatus === "unavailable"
              ? "Telegram նույնականացումը այս միջավայրում կազմաձևված չէ։"
              : "Անձնական բաժինը հասանելի է Telegram Mini App-ից բացելիս։"}</p>
          {loaderData.authStatus === "guest" ? (
            <div className="mt-3 grid w-full gap-2">
              <span className="text-[12px] text-faint">Շուտով կարող ես մտնել նաև՝</span>
              {[
                { name: "Google", mark: "G" },
                { name: "Facebook", mark: "f" },
              ].map((provider) => (
                <button
                  key={provider.name}
                  className="flex min-h-11 w-full cursor-not-allowed items-center gap-3 rounded-[13px] border border-glass-border bg-subtle px-3 text-left text-[13px] font-semibold text-muted opacity-80"
                  type="button"
                  disabled
                  aria-disabled="true"
                >
                  <span className="grid size-7 place-items-center rounded-full bg-glass-strong font-bold text-ink" aria-hidden="true">{provider.mark}</span>
                  Մուտք {provider.name}-ով
                  <span className="ml-auto rounded-full border border-[rgb(217_181_111/35%)] px-2 py-0.5 text-[10.5px] text-gold-bright">Շուտով</span>
                </button>
              ))}
            </div>
          ) : null}
        </EmptyState>
      ) : (
        <section className="grid gap-3" aria-labelledby="saved-title">
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
        </section>
      )}
    </PageShell>
  );
}

export function ErrorBoundary({}: Route.ErrorBoundaryProps) {
  return <PageShell><SiteNav /><RouteErrorState title="Իմ անկյունը չբացվեց" /></PageShell>;
}
