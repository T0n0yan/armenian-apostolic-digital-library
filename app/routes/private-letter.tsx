import { env } from "cloudflare:workers";
import { Form, useNavigation } from "react-router";

import type { Route } from "./+types/private-letter";
import { getOptionalTelegramAdmin, requireSameOrigin } from "../auth/admin.server";
import { getOptionalTelegramUser } from "../auth/telegram-user.server";
import { RouteErrorPage } from "../components/error-page";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { fieldControl, fieldHint, fieldLabel, panelSection } from "../components/ui-styles";
import { findRecipientAccounts, getPrivateLetter, savePrivateLetter } from "../data/private-letter.server";
import { letterVisibleTo, yerevanDay, type PrivateLetter } from "../utils/private-letter";

export function meta() {
  return [{ title: "Նամակ" }, { name: "robots", content: "noindex, nofollow" }];
}
export function headers() { return { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" }; }

// Ուրիշի համար էջը պարզապես չկա (404), որ չիմանան, թե այստեղ ինչ-որ բան կա։
const notFound = () => new Response("Not found.", { status: 404, statusText: "Not Found" });

export async function loader({ request }: Route.LoaderArgs) {
  const [user, admin, letter] = await Promise.all([
    getOptionalTelegramUser(request),
    getOptionalTelegramAdmin(request, env.DB),
    getPrivateLetter(env.DB),
  ]);
  if (admin?.owner) return { mode: "owner" as const, letter, today: yerevanDay() };
  if (letterVisibleTo(letter, user?.id)) return { mode: "reader" as const, letter: { title: letter.title, body: letter.body } };
  throw notFound();
}

const TITLE_MAX = 120;
const BODY_MAX = 8000;

export async function action({ request }: Route.ActionArgs) {
  const admin = await getOptionalTelegramAdmin(request, env.DB);
  if (!admin?.owner) throw notFound();
  requireSameOrigin(request);
  const form = await request.formData();
  const recipient = String(form.get("recipient") ?? "").trim().slice(0, 300);
  const visibleFrom = String(form.get("visibleFrom") ?? "");
  const found = await findRecipientAccounts(env.DB, recipient);
  if (!found.ids.length) return { error: "Այս հասցեով հաշիվ չգտնվեց։ Նա պետք է գոնե մեկ անգամ մտած լինի կայք (Google-ով կամ Telegram-ով)։" };
  const letter: PrivateLetter = {
    recipientIds: found.ids,
    recipientLabel: recipient,
    title: String(form.get("title") ?? "").trim().slice(0, TITLE_MAX),
    body: String(form.get("body") ?? "").replace(/\r\n/gu, "\n").trim().slice(0, BODY_MAX),
    visibleFrom: /^\d{4}-\d{2}-\d{2}$/u.test(visibleFrom) ? visibleFrom : "",
    updatedAt: new Date().toISOString(),
  };
  await savePrivateLetter(env.DB, letter);
  return { saved: `Պահված է։ Ստացողը՝ ${found.names.join(", ") || recipient} (${found.ids.length} հաշիվ)։` };
}

/** The letter itself, as the recipient sees it (the owner sees the same as a preview). */
function Letter({ title, body }: { title: string; body: string }) {
  return (
    <article className={`${panelSection} grid gap-4 text-center`}>
      <div className="text-[44px] leading-none" aria-hidden="true">💌</div>
      {title && <h2 className="m-0 font-noto text-[22px] font-semibold text-gold-bright">{title}</h2>}
      <p className="m-0 whitespace-pre-line text-left text-[16px] leading-[1.8] text-ink">{body}</p>
    </article>
  );
}

export default function PrivateLetterPage({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  if (loaderData.mode === "reader") {
    return (
      <PageShell>
        <SiteNav />
        <PageHeader showSearch={false} backTo="/" backLabel="Գրադարան" title="Նամակ քեզ համար" />
        <div className="mt-4"><Letter {...loaderData.letter} /></div>
      </PageShell>
    );
  }
  const { letter, today } = loaderData;
  const waiting = letter.visibleFrom && letter.visibleFrom > today;
  return (
    <PageShell>
      <SiteNav />
      <PageHeader showSearch={false} backTo="/" backLabel="Գրադարան" title="Անձնական նամակ" />
      <div className="mt-4 grid gap-4">
        <Form method="post" className={`${panelSection} grid gap-4`}>
          <p className={fieldHint}>Այս էջը տեսնում եք միայն դուք և ստացողը։ Մնացածի համար այն չկա։</p>
          <label className={fieldLabel}>Ստացողը (Gmail հասցեն կամ @Telegram username)
            <input className={fieldControl} name="recipient" defaultValue={letter.recipientLabel} required maxLength={300} placeholder="anun@gmail.com" autoComplete="off" />
          </label>
          <label className={fieldLabel}>Վերնագիր
            <input className={fieldControl} name="title" defaultValue={letter.title} maxLength={TITLE_MAX} placeholder="Օր.՝ Մեր առաջին տարին" />
          </label>
          <label className={fieldLabel}>Ցույց տալ սկսած (Երևանի ժամով)
            <input className={fieldControl} type="date" name="visibleFrom" defaultValue={letter.visibleFrom} />
          </label>
          <label className={fieldLabel}>Նամակը
            <textarea className={`${fieldControl} min-h-[220px] resize-y leading-[1.7]`} name="body" defaultValue={letter.body} required maxLength={BODY_MAX} />
          </label>
          {actionData && "error" in actionData && <p className="m-0 text-[13px] font-semibold text-danger" role="alert">{actionData.error}</p>}
          {actionData && "saved" in actionData && <p className="m-0 text-[13px] font-semibold text-gold-bright" role="status">{actionData.saved}</p>}
          <button type="submit" disabled={busy} className="min-h-12 cursor-pointer rounded-full border border-[rgb(217_181_111/45%)] bg-[rgb(217_181_111/18%)] px-5 text-[15px] font-bold text-gold-bright disabled:opacity-60">
            {busy ? "Պահվում է…" : "Պահել"}
          </button>
          {letter.body && (
            <p className={fieldHint}>
              {waiting ? `Ստացողը կտեսնի ${letter.visibleFrom}-ից։` : "Ստացողն արդեն տեսնում է նամակը։"} Կայք մտնելիս նրա մոտ կհայտնվի «💌 Քեզ համար նամակ կա» պատուհանը։
            </p>
          )}
        </Form>
        {letter.body && <>
          <h2 className="m-0 text-[13px] font-bold text-muted">Ինչպես է այն տեսնում ստացողը</h2>
          <Letter title={letter.title} body={letter.body} />
        </>}
      </div>
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
