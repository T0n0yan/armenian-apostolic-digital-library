import { env } from "cloudflare:workers";
import { Bookmark, Search } from "lucide-react";
import { memo, useCallback, useMemo } from "react";
import { Link } from "react-router";

import type { Route } from "./+types/saved";
import {
  getOptionalTelegramUser,
  requireSameOriginUserRequest,
  requireTelegramUser,
  upsertAppUser,
} from "../auth/telegram-user.server";
import { MaterialResultCard } from "../components/material-result-card";
import { SiteNav } from "../components/site-nav";
import {
  listSavedMaterials,
  setMaterialSaved,
  type SavedMaterial,
} from "../data/saved-materials.server";
import { useSavedMaterials } from "../hooks/use-saved-materials";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Իմ անկյունը — Թվային գրադարան" },
    { name: "robots", content: "noindex, nofollow, noarchive" },
    { name: "theme-color", content: "#100817" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getOptionalTelegramUser(request);
  if (!user) return { user: null, materials: [] };
  await upsertAppUser(env.DB, user);
  return {
    user,
    materials: await listSavedMaterials(env.DB, user.id),
  };
}

export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const user = await requireTelegramUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const materialId = formData.get("materialId");
  if (
    (intent !== "save" && intent !== "remove") ||
    typeof materialId !== "string" ||
    !/^material_[a-zA-Z0-9_-]{1,100}$/.test(materialId)
  ) {
    return Response.json({ saved: false, error: "invalid-request" }, { status: 400 });
  }

  await upsertAppUser(env.DB, user);
  const saved = await setMaterialSaved(env.DB, user.id, materialId, intent === "save");
  return Response.json({ saved });
}

const SavedList = memo(function SavedList({ materials }: { materials: SavedMaterial[] }) {
  const savedMaterialIds = useMemo(
    () => materials.map((material) => material.id),
    [materials],
  );
  const { isSaving, pendingMaterialId, savedIds, setSaved } =
    useSavedMaterials(savedMaterialIds);
  const handleSavedChange = useCallback(
    (materialId: string, saved: boolean) => setSaved(materialId, saved),
    [setSaved],
  );

  return (
    <ol className="materials-list saved-materials-list">
      {materials.map((material) => (
        <MaterialResultCard
          key={material.id}
          material={material}
          canSave
          isSaved={savedIds.has(material.id)}
          isSaving={isSaving && pendingMaterialId === material.id}
          onSavedChange={handleSavedChange}
        />
      ))}
    </ol>
  );
});

export default function Saved({ loaderData }: Route.ComponentProps) {
  return (
    <main className="saved-page">
      <SiteNav actionHref="/" actionLabel="← Գրադարան" />
      <header className="saved-header">
        <p className="library-kicker">Անձնական տարածք</p>
        <h1>Իմ անկյունը</h1>
        <p>
          {loaderData.user
            ? `${loaderData.user.displayName}, այստեղ են քո պահած նյութերը։`
            : "Պահած նյութերը հասանելի են Telegram Mini App-ի ներսում։"}
        </p>
      </header>

      {!loaderData.user ? (
        <section className="saved-empty-state">
          <Bookmark aria-hidden="true" size={28} strokeWidth={1.6} />
          <h2>Բացիր գրադարանը Telegram-ից</h2>
          <p>Այդպես քո պահած նյութերը կապվում են հենց քո Telegram հաշվի հետ։</p>
        </section>
      ) : loaderData.materials.length === 0 ? (
        <section className="saved-empty-state">
          <Bookmark aria-hidden="true" size={28} strokeWidth={1.6} />
          <h2>Դեռ ոչինչ չես պահել</h2>
          <p>Նյութի կողքի նշանը սեղմիր, և այն կհայտնվի այստեղ։</p>
          <Link className="saved-search-link" to="/search">
            <Search aria-hidden="true" size={17} /> Գտնել նյութ
          </Link>
        </section>
      ) : (
        <section className="saved-results" aria-labelledby="saved-title">
          <div className="section-heading">
            <h2 id="saved-title">Պահված նյութեր</h2>
            <span>{loaderData.materials.length}</span>
          </div>
          <SavedList materials={loaderData.materials} />
        </section>
      )}
    </main>
  );
}
