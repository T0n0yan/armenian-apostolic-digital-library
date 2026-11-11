import { env } from "cloudflare:workers";
import { ArrowDown, ArrowUp, CircleCheck, CirclePlay, Clock3, LoaderCircle, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { useState } from "react";
import { Form, Link, redirect, useRevalidator } from "react-router";

import type { Route } from "./+types/admin-help";
import { requirePermission, requireSameOrigin } from "../auth/admin.server";
import { RouteErrorPage } from "../components/error-page";
import { HelpVideoSheet } from "../components/help-video-sheet";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { panelSection } from "../components/ui-styles";
import { addHelpItem, moveHelpItem, readHelpConfig, removeHelpItem, removeHelpVideo, renameHelpItem, setHelpOnboarding } from "../data/help-videos.server";
import { HELP_TITLE_MAX, helpVideoList, isHelpId } from "../utils/help-videos";

type Bindings = { DB: D1Database; MEDIA: R2Bucket };

export function meta() {
  return [{ title: "Օգնության տեսանյութեր — Կառավարում" }, { name: "robots", content: "noindex, nofollow" }];
}

// Միայն «Օգնության տեսանյութեր» իրավունք ունեցողը (և գլխավոր ադմինը)
export async function loader({ request }: Route.LoaderArgs) {
  await requirePermission(request, env.DB, "help").catch((error: unknown) => {
    if (error instanceof Response && (error.status === 401 || error.status === 403)) throw redirect("/");
    throw error;
  });
  const config = await readHelpConfig(env.DB);
  return { videos: helpVideoList(config), files: config.files, onboarding: config.onboarding };
}

export async function action({ request }: Route.ActionArgs) {
  await requirePermission(request, env.DB, "help");
  requireSameOrigin(request);
  const { DB, MEDIA } = env as unknown as Bindings;
  const form = await request.formData();
  const intent = form.get("intent");
  const id = form.get("id");
  if (intent === "onboarding") await setHelpOnboarding(DB, form.get("on") === "1");
  if (intent === "add") await addHelpItem(DB, String(form.get("title") ?? ""));
  if (isHelpId(id)) {
    if (intent === "delete") await removeHelpVideo(DB, MEDIA, id);          // միայն տեսանյութը
    if (intent === "remove") await removeHelpItem(DB, MEDIA, id);           // վերնագիրը՝ տեսանյութով
    if (intent === "rename") await renameHelpItem(DB, id, String(form.get("title") ?? ""));
    if (intent === "up" || intent === "down") await moveHelpItem(DB, id, intent === "up" ? -1 : 1);
  }
  return { ok: true };
}

const small = "inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-glass-border bg-subtle px-3.5 text-[13px] font-bold text-ink";
const MB = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} ՄԲ`;

/** Ֆայլը ուղարկվում է որպես հարցման մարմին (XHR՝ որ երևա տոկոսը)։ */
function upload(id: string, file: File, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/admin/help/${id}/video`);
    xhr.setRequestHeader("content-type", file.type || "video/mp4");
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      try { reject(new Error((JSON.parse(xhr.responseText) as { error?: string }).error ?? "Չհաջողվեց")); } catch { reject(new Error("Չհաջողվեց վերբեռնել։")); }
    };
    xhr.onerror = () => reject(new Error("Կապը ընդհատվեց։ Փորձեք նորից։"));
    xhr.send(file);
  });
}

export default function AdminHelp({ loaderData }: Route.ComponentProps) {
  const { revalidate } = useRevalidator();
  const [busy, setBusy] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const ready = loaderData.videos.filter((video) => video.url);
  const count = ready.length, total = loaderData.videos.length;

  const choose = async (id: string, file: File | undefined) => {
    if (!file) return;
    setErrors((old) => ({ ...old, [id]: "" }));
    setBusy((old) => ({ ...old, [id]: 0 }));
    try {
      await upload(id, file, (percent) => setBusy((old) => ({ ...old, [id]: percent })));
      revalidate();
    } catch (error) {
      setErrors((old) => ({ ...old, [id]: error instanceof Error ? error.message : "Չհաջողվեց" }));
    } finally {
      setBusy((old) => { const next = { ...old }; delete next[id]; return next; });
    }
  };

  return (
    <PageShell>
      <SiteNav />
      <PageHeader showSearch={false} backTo="/admin" backLabel="Կառավարում" title="Օգնության տեսանյութեր" />
      <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <section className={`${panelSection} grid min-w-0 gap-3`}>
          <p className="m-0 text-[14px] leading-relaxed text-muted">
            Վերբեռնված է <strong className="text-ink">{count} / {total}</strong>։ Տեսանյութերը երևում են{" "}
            <Link className="text-gold-bright" to="/ognutyun">«Օգնություն»</Link> էջում։ Ֆայլը՝ MP4, մինչև 95 ՄԲ։
          </p>
          <p className="m-0 text-[13px] text-muted">Տեսանյութերը բացվում են միայն ընթերցողի ընտրությամբ՝ «Օգնություն» էջից։</p>
        </section>

        <ol className="m-0 grid list-none gap-2.5 p-0">
          {loaderData.videos.map((video) => {
            const file = loaderData.files[video.id];
            const progress = busy[video.id];
            return (
              <li key={video.id} className={`${panelSection} grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2.5 !p-3.5`}>
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#f1d79c,#c99a4b_60%,#a87a32)] text-[14px] font-bold text-[#2a1708]">{video.number}</span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    {editing === video.id ? (
                      <Form method="post" className="flex gap-1.5" onSubmit={() => setEditing(null)}>
                        <input type="hidden" name="intent" value="rename" />
                        <input type="hidden" name="id" value={video.id} />
                        <input className="min-h-10 w-0 min-w-0 flex-1 rounded-[12px] border border-glass-border bg-control px-2.5 text-[15px] text-ink" name="title" defaultValue={video.title} maxLength={HELP_TITLE_MAX} required autoFocus />
                        <button className={small} type="submit">Պահել</button>
                        <button className={small} type="button" onClick={() => setEditing(null)} aria-label="Չեղարկել"><X aria-hidden="true" size={15} /></button>
                      </Form>
                    ) : <strong className="font-noto text-[15px] leading-snug">{video.title}</strong>}
                    {file
                      ? <span className="flex min-w-0 flex-wrap items-center gap-x-1 text-[12.5px] text-[rgb(52_130_74)]"><CircleCheck aria-hidden="true" size={14} className="shrink-0" /> Վերբեռնված՝ {MB(file.size)}, {new Date(file.updatedAt).toLocaleDateString("hy-AM", { day: "numeric", month: "long" })}</span>
                      : <span className="inline-flex items-center gap-1 text-[12.5px] text-faint"><Clock3 aria-hidden="true" size={14} /> Դեռ չկա</span>}
                  </span>
                  {/* Կարգը՝ վեր/վար */}
                  <span className="flex shrink-0 flex-col gap-1">
                    {(["up", "down"] as const).map((dir) => (
                      <Form key={dir} method="post">
                        <input type="hidden" name="intent" value={dir} />
                        <input type="hidden" name="id" value={video.id} />
                        <button className="grid size-8 cursor-pointer place-items-center rounded-full border border-glass-border bg-subtle text-muted disabled:opacity-30" type="submit"
                          disabled={dir === "up" ? video.number === 1 : video.number === total} aria-label={dir === "up" ? "Վեր" : "Վար"}>
                          {dir === "up" ? <ArrowUp aria-hidden="true" size={15} /> : <ArrowDown aria-hidden="true" size={15} />}
                        </button>
                      </Form>
                    ))}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-[rgb(217_181_111/45%)] bg-[rgb(217_181_111/12%)] px-3.5 text-[13px] font-bold text-gold-bright ${progress !== undefined ? "pointer-events-none opacity-70" : ""}`}>
                    {progress !== undefined ? <LoaderCircle aria-hidden="true" size={15} className="animate-search-spin" /> : <Upload aria-hidden="true" size={15} />}
                    {progress !== undefined ? `Վերբեռնվում է… ${progress}%` : file ? "Փոխել" : "Վերբեռնել"}
                    <input className="sr-only" type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(event) => { void choose(video.id, event.target.files?.[0]); event.target.value = ""; }} />
                  </label>
                  {video.url ? (
                    <button className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-glass-border bg-subtle px-3.5 text-[13px] font-bold text-ink" type="button" onClick={() => setPreview(ready.findIndex((item) => item.id === video.id))}>
                      <CirclePlay aria-hidden="true" size={15} /> Դիտել
                    </button>
                  ) : null}
                  {file ? (
                    <Form method="post" onSubmit={(event) => { if (!window.confirm(`Ջնջե՞լ «${video.title}» տեսանյութը (վերնագիրը կմնա)`)) event.preventDefault(); }}>
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="id" value={video.id} />
                      <button className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-[rgb(239_145_136/45%)] bg-transparent px-3.5 text-[13px] font-bold text-danger" type="submit">
                        <Trash2 aria-hidden="true" size={15} /> Ջնջել տեսանյութը
                      </button>
                    </Form>
                  ) : null}
                  <button className={small} type="button" onClick={() => setEditing(video.id)}><Pencil aria-hidden="true" size={14} /> Անվանել</button>
                  <Form method="post" onSubmit={(event) => { if (!window.confirm(`Հանե՞լ «${video.title}»-ը ցանկից${file ? " (տեսանյութն էլ կջնջվի)" : ""}`)) event.preventDefault(); }}>
                    <input type="hidden" name="intent" value="remove" />
                    <input type="hidden" name="id" value={video.id} />
                    <button className={`${small} text-danger`} type="submit"><X aria-hidden="true" size={15} /> Հանել ցանկից</button>
                  </Form>
                </div>
                {errors[video.id] ? <p className="m-0 text-[12.5px] text-danger">{errors[video.id]}</p> : null}
              </li>
            );
          })}
        </ol>

        {/* Նոր վերնագիր. տեսանյութը վերբեռնվում է հետո, ցանկի մեջ */}
        <Form method="post" className={`${panelSection} grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2.5 !p-3.5`} onSubmit={(event) => { const form = event.currentTarget; window.setTimeout(() => form.reset(), 0); }}>
          <input type="hidden" name="intent" value="add" />
          <strong className="text-[14.5px]">Նոր վերնագիր</strong>
          <div className="flex gap-2">
            <input className="min-h-11 w-0 min-w-0 flex-1 rounded-[12px] border border-glass-border bg-control px-3 text-[15px] text-ink" name="title" placeholder="Օր.՝ Ինչպես կիսվել նյութով" maxLength={HELP_TITLE_MAX} required />
            <button className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[12px] border border-[rgb(217_181_111/55%)] bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] px-4 text-[14px] font-bold text-[#2a1708]" type="submit">
              <Plus aria-hidden="true" size={16} /> Ավելացնել
            </button>
          </div>
          <span className="text-[12.5px] text-muted">Ավելացնելուց հետո ցանկում կհայտնվի «Վերբեռնել» կոճակը։ Կարգը փոխեք ↑ ↓ կոճակներով։</span>
        </Form>
      </div>
      {preview !== null ? <HelpVideoSheet videos={ready} index={preview} onIndex={setPreview} onClose={() => setPreview(null)} /> : null}
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
