import { env } from "cloudflare:workers";
import { Bookmark, ChevronDown, Search, X } from "lucide-react";
import { memo, useCallback, useMemo } from "react";
import { Form, Link } from "react-router";

import type { Route } from "./+types/saved";
import {
  getOptionalTelegramUser,
  requireSameOriginUserRequest,
  requireTelegramUser,
  upsertAppUser,
} from "../auth/telegram-user.server";
import { CategoryIcon } from "../components/category-icon";
import { MaterialResultCard } from "../components/material-result-card";
import { SiteNav } from "../components/site-nav";
import {
  groupSavedMaterials,
  listSavedMaterials,
  setMaterialSaved,
  type SavedMaterialGroup,
} from "../data/saved-materials.server";
import { useSavedMaterials } from "../hooks/use-saved-materials";
import { useDebouncedFormSubmit } from "../hooks/use-debounced-form-submit";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Իմ անկյունը — Թվային գրադարան" },
    { name: "robots", content: "noindex, nofollow, noarchive" },
    { name: "theme-color", content: "#100817" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const query = (new URL(request.url).searchParams.get("q") ?? "")
    .trim()
    .slice(0, 120);
  const user = await getOptionalTelegramUser(request);
  if (!user) return { user: null, groups: [], query, total: 0 };
  await upsertAppUser(env.DB, user);
  const materials = await listSavedMaterials(env.DB, user.id, query);
  return {
    user,
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
    !/^material_[a-zA-Z0-9_-]{1,100}$/.test(materialId) ||
    typeof personalNote !== "string" ||
    Array.from(personalNote).length > 160
  ) {
    return Response.json({ saved: false, error: "invalid-request" }, { status: 400 });
  }

  await upsertAppUser(env.DB, user);
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
    <details className="group overflow-hidden rounded-[18px] border border-glass-border bg-[linear-gradient(145deg,rgb(255_255_255/7%),transparent_48%),var(--glass)] shadow-card animate-glass-enter" open={open}>
      <summary className="grid min-h-[66px] cursor-pointer list-none grid-cols-[34px_minmax(0,1fr)_auto_20px] items-center gap-2.5 px-[13px] py-[11px] outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[rgb(217_181_111/42%)]">
        <CategoryIcon categoryId={group.categoryId} size={20} strokeWidth={1.8} />
        <span className="grid gap-0.5">
          <strong className="text-[0.84rem]">{group.categoryName}</strong>
          <small className="text-[0.66rem] text-faint">{materials.length} պահված նյութ</small>
        </span>
        <span className="grid h-8 min-w-8 place-items-center rounded-full border border-glass-border px-2 text-[0.72rem] text-gold-bright tabular-nums">{materials.length}</span>
        <ChevronDown className="text-gold transition-transform duration-[180ms] group-open:rotate-180" aria-hidden="true" size={18} />
      </summary>
      <ol className="m-0 grid list-none gap-2.5 px-[9px] pb-[9px]">
        {materials.map((material) => (
          <MaterialResultCard
            key={material.id}
            material={material}
            highlightQuery={query}
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

const SavedSearch = memo(function SavedSearch({ query }: { query: string }) {
  const { cancelPending, formRef, scheduleSubmit } =
    useDebouncedFormSubmit(650);

  return (
    <Form
      ref={formRef}
      className="flex min-h-[50px] items-center gap-2.5 rounded-2xl border border-glass-border bg-control px-3 text-faint"
      role="search"
      method="get"
      onSubmit={cancelPending}
    >
      <Search aria-hidden="true" size={18} strokeWidth={1.9} />
      <input
        className="min-w-0 flex-1 border-0 bg-transparent text-ink outline-none"
        type="search"
        name="q"
        defaultValue={query}
        onInput={scheduleSubmit}
        placeholder="Փնտրել պահվածներում կամ իմ նշումներում…"
        aria-label="Փնտրել պահված նյութերում"
      />
      {query ? (
        <Link className="grid size-8 shrink-0 place-items-center rounded-[10px] text-muted" to="/saved" aria-label="Մաքրել որոնումը" title="Մաքրել">
          <X aria-hidden="true" size={17} />
        </Link>
      ) : null}
    </Form>
  );
});

export default function Saved({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto min-h-svh w-[min(100%,940px)] pt-[calc(var(--tg-content-safe-area-inset-top,0px)+12px)] pr-[calc(var(--tg-content-safe-area-inset-right,0px)+clamp(14px,3vw,32px))] pb-[calc(var(--tg-content-safe-area-inset-bottom,0px)+clamp(44px,7vw,88px))] pl-[calc(var(--tg-content-safe-area-inset-left,0px)+clamp(14px,3vw,32px))] min-[560px]:pt-[calc(var(--tg-content-safe-area-inset-top,0px)+20px)] min-[1440px]:pt-[calc(var(--tg-content-safe-area-inset-top,0px)+26px)]">
      <SiteNav actionHref="/" actionLabel="← Գրադարան" />
      <header className="px-[clamp(2px,1vw,10px)] pt-[clamp(48px,8vw,92px)] pb-[clamp(28px,5vw,48px)] min-[1440px]:pt-[82px]">
        <p className="m-0 text-[clamp(0.7rem,1.3vw,0.78rem)] font-extrabold tracking-[0.1em] text-gold uppercase">Անձնական տարածք</p>
        <h1 className="mt-[13px] mb-0 max-w-[860px] text-[clamp(1.85rem,4.5vw,3.65rem)] leading-[1.06] font-[740] tracking-[-0.035em] text-balance">Իմ անկյունը</h1>
        <p className="mt-[18px] mb-0 max-w-[650px] text-[clamp(0.92rem,1.5vw,1.05rem)] leading-[1.65] text-muted">
          {loaderData.user
            ? `${loaderData.user.displayName}, այստեղ են քո պահած նյութերը։`
            : "Պահած նյութերը հասանելի են Telegram Mini App-ի ներսում։"}
        </p>
      </header>

      {!loaderData.user ? (
        <section className="grid justify-items-start gap-[9px] rounded-[22px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] p-[clamp(22px,5vw,38px)] text-muted shadow-glass [&_h2]:m-0 [&_h2]:text-base [&_h2]:text-ink [&_p]:m-0 [&_p]:text-[0.8rem] [&_p]:leading-[1.55]">
          <Bookmark aria-hidden="true" size={28} strokeWidth={1.6} />
          <h2>Բացիր գրադարանը Telegram-ից</h2>
          <p>Այդպես քո պահած նյութերը կապվում են հենց քո Telegram հաշվի հետ։</p>
        </section>
      ) : loaderData.total === 0 && !loaderData.query ? (
        <section className="grid justify-items-start gap-[9px] rounded-[22px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] p-[clamp(22px,5vw,38px)] text-muted shadow-glass [&_h2]:m-0 [&_h2]:text-base [&_h2]:text-ink [&_p]:m-0 [&_p]:text-[0.8rem] [&_p]:leading-[1.55]">
          <Bookmark aria-hidden="true" size={28} strokeWidth={1.6} />
          <h2>Դեռ ոչինչ չես պահել</h2>
          <p>Նյութի կողքի նշանը սեղմիր, և այն կհայտնվի այստեղ։</p>
          <Link className="mt-[7px] inline-flex items-center gap-1.5 rounded-[11px] border border-[rgb(217_181_111/24%)] bg-[rgb(217_181_111/8%)] px-3 py-[9px] text-[0.76rem] font-[720] text-gold-bright no-underline" to="/search">
            <Search aria-hidden="true" size={17} /> Գտնել նյութ
          </Link>
        </section>
      ) : (
        <section className="mt-5 grid gap-3.5" aria-labelledby="saved-title">
          <SavedSearch query={loaderData.query} />
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 className="m-0 text-[clamp(1rem,2vw,1.2rem)]" id="saved-title">
              {loaderData.query ? "Գտնված նյութեր" : "Պահված նյութեր"}
            </h2>
            <span className="grid min-h-[34px] min-w-[34px] place-items-center rounded-full border border-glass-border text-[0.8rem] text-muted tabular-nums">{loaderData.total}</span>
          </div>
          {loaderData.groups.length === 0 ? (
            <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-[13px] gap-y-[11px] rounded-[18px] border border-glass-border bg-[linear-gradient(145deg,rgb(255_255_255/7%),transparent_52%),var(--glass)] p-4 text-muted [&>a]:col-start-2 [&>a]:w-fit [&>a]:text-[0.72rem] [&>a]:font-[740] [&>a]:text-gold-bright [&>a]:no-underline [&_h2]:m-0 [&_h2]:text-[0.91rem] [&_h2]:leading-[1.45] [&_h2]:text-ink [&_p]:m-0 [&_p]:text-[0.72rem] [&_p]:leading-[1.5]">
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
    </main>
  );
}
