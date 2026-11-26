import { env } from "cloudflare:workers";
import { data, Form, Link, redirect, useFetcher, useNavigation } from "react-router";

import type { Route } from "./+types/admin-church-model";
import { requirePermission, requireSameOrigin } from "../auth/admin.server";
import { RouteErrorPage } from "../components/error-page";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { getPlace } from "../data/places.server";
import { bumpCacheEpoch } from "../data/site-refresh.server";
import { getModelRecord, publishDraft, restoreVersion, saveDraft, unpublish } from "../data/church-models.server";
import { ChurchEditor } from "../church3d/editor";
import type { ChurchModel } from "../church3d/model";
import { formatArmenianDate } from "../utils/armenian-date";

// Սրբավայրի 3D մոդելի խմբագրիչ։ Ադմինները («places» թույլտվություն) պահում են սևագիրը, հրապարակում է միայն տերը։

export function meta() {
  return [{ title: "3D մոդել — Կառավարում" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const admin = await requirePermission(request, env.DB, "places").catch((error: unknown) => {
    if (error instanceof Response && (error.status === 401 || error.status === 403)) throw redirect("/");
    throw error;
  });
  const place = await getPlace(env.DB, params.id);
  if (!place) throw new Response("Not found", { status: 404 });
  const record = await getModelRecord(env.DB, place.id);
  return { place: { id: place.id, name: place.name, published: place.published }, record, isOwner: admin.owner };
}

export async function action({ request, params }: Route.ActionArgs) {
  requireSameOrigin(request);
  const admin = await requirePermission(request, env.DB, "places");
  const place = await getPlace(env.DB, params.id);
  if (!place) throw new Response("Not found", { status: 404 });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent === "save") {
    const result = await saveDraft(env.DB, place.id, String(form.get("model") ?? ""), admin.email);
    return result.ok ? { ok: true, errors: [] as string[] } : data({ ok: false, errors: result.errors }, { status: 400 });
  }
  if (intent === "restore") {
    const result = await restoreVersion(env.DB, place.id, Number(form.get("version")), admin.email);
    return result.ok ? { ok: true, errors: [] as string[] } : data({ ok: false, errors: result.errors }, { status: 400 });
  }
  // Հրապարակել/թաքցնել՝ միայն տերը (տիրոջ որոշում)։
  if (!admin.owner) return data({ ok: false, errors: ["Հրապարակել կարող է միայն տերը"] }, { status: 403 });
  // Սրբավայրի էջը քեշավորված է. հրապարակելիս/թաքցնելիս թարմացնում ենք, որ «3D» կոճակը միանգամից երևա/անհետանա։
  if (intent === "publish") {
    if (!(await publishDraft(env.DB, place.id, admin.email))) return data({ ok: false, errors: ["Սևագիր չկա"] }, { status: 400 });
    await bumpCacheEpoch(env.DB);
    return { ok: true, errors: [] as string[] };
  }
  if (intent === "unpublish") { await unpublish(env.DB, place.id); await bumpCacheEpoch(env.DB); return { ok: true, errors: [] as string[] }; }
  return data({ ok: false, errors: ["Անհայտ գործողություն"] }, { status: 400 });
}

const small = "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-edge bg-subtle px-3 text-[13px] font-semibold text-ink disabled:cursor-default disabled:opacity-40";

export default function AdminChurchModel({ loaderData }: Route.ComponentProps) {
  const { place, record, isOwner } = loaderData;
  const fetcher = useFetcher<{ ok: boolean; errors: string[] }>();
  const navigation = useNavigation();
  const saving = fetcher.state !== "idle";
  const busy = navigation.state !== "idle";
  const save = (model: ChurchModel) => fetcher.submit({ intent: "save", model: JSON.stringify(model) }, { method: "post" });
  return (
    <PageShell width="admin">
      <SiteNav />
      <PageHeader backTo={`/admin/places/${place.id}`} backLabel={place.name} title="3D մոդել" />
      <div className="mt-4 grid gap-5">
        <section className="paper-panel grid gap-3 px-4 py-4 text-[13.5px]">
          <p className="m-0">
            {record.published
              ? <>Կայքում հրապարակված է{record.publishedAt ? ` (${formatArmenianDate(record.publishedAt)})` : ""}։ {record.changed ? "Սևագիրը տարբերվում է հրապարակվածից։" : ""}</>
              : record.draft ? "Սևագիր է, կայքում դեռ չի երևում։" : "Մոդել դեռ չկա. սկսվում է «Խաչաձև գմբեթավոր» ձևանմուշից։"}
          </p>
          <div className="flex flex-wrap gap-2">
            {record.published && place.published ? <Link className={small} to={`/church-3d?place=${place.id}`}>Բացել կայքում →</Link> : null}
            {isOwner ? (
              <>
                <Form method="post"><input type="hidden" name="intent" value="publish" /><button className={small} disabled={busy || !record.draft || (!record.changed && Boolean(record.published))}>Հրապարակել</button></Form>
                {record.published ? <Form method="post"><input type="hidden" name="intent" value="unpublish" /><button className={small} disabled={busy}>Թաքցնել կայքից</button></Form> : null}
              </>
            ) : <span className="text-[12px] text-faint">Հրապարակում է տերը։</span>}
          </div>
          {!place.published ? <p className="m-0 text-[12px] text-faint">Սրբավայրը ինքը թաքնված է, այդ պատճառով 3D-ն էլ կայքում չի երևա։</p> : null}
        </section>

        <ChurchEditor key={record.updatedAt ?? "new"} initial={record.draft} placeId={place.id} placeName={place.name}
          saving={saving} errors={fetcher.data?.errors ?? []} onSave={save} />

        {record.versions.length ? (
          <section className="paper-panel grid gap-2 px-4 py-4">
            <h3 className="m-0 text-[12px] font-bold tracking-[1.2px] text-gold uppercase">Նախորդ տարբերակներ</h3>
            {record.versions.map((version) => (
              <Form key={version.id} method="post" className="flex flex-wrap items-center justify-between gap-2 border-t border-edge pt-2 text-[13px]">
                <span>{formatArmenianDate(version.savedAt)} · {version.savedBy || "—"}{version.published ? " · հրապարակված" : ""}</span>
                <input type="hidden" name="intent" value="restore" />
                <input type="hidden" name="version" value={version.id} />
                <button className={small} disabled={busy}>Վերադարձնել որպես սևագիր</button>
              </Form>
            ))}
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
