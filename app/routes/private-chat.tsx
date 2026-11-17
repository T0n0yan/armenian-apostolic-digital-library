import { env } from "cloudflare:workers";

import type { Route } from "./+types/private-chat";
import { requireSameOrigin } from "../auth/admin.server";
import { RouteErrorPage } from "../components/error-page";
import { PrivateChat } from "../components/private-chat";
import { chatDiagnostics, chatParticipant, chatRoom } from "../data/private-chat.server";
import { PRIVATE_CHAT_OPEN } from "../utils/private-chat";
import { findRecipientAccounts, getPrivateLetter, savePrivateLetter } from "../data/private-letter.server";

export function meta() {
  return [{ title: "Apostolic.am" }, { name: "robots", content: "noindex, nofollow" }];
}
export function headers() { return { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" }; }

// Ուրիշի համար էջը պարզապես չկա (404), որ չիմանան, թե այստեղ ինչ-որ բան կա։
const notFound = () => new Response("Not found.", { status: 404, statusText: "Not Found" });

/** Միայն երկու կողմին. մնացածին՝ 404։ Հաղորդագրությունները գալիս են socket-ով, ոչ թե այստեղից։ */
export async function loader({ request }: Route.LoaderArgs) {
  if (!PRIVATE_CHAT_OPEN) throw notFound();
  const who = await chatParticipant(request);
  if (!who) throw notFound();
  if (who.side !== "a") return { side: who.side, recipient: null, diagnostics: null };
  const letter = await getPrivateLetter(env.DB);
  return { side: who.side, recipient: letter.recipientLabel, diagnostics: await chatDiagnostics(letter.recipientIds).catch(() => null) };
}

/** Տերը նշում է ստացողին։ Երբ արդեն նամակներ կան, ուրիշին փոխել չի կարելի (նա կտեսներ ամբողջ զրույցը)։ */
export async function action({ request }: Route.ActionArgs) {
  if (!PRIVATE_CHAT_OPEN) throw notFound();
  const who = await chatParticipant(request);
  if (who?.side !== "a") throw notFound();
  requireSameOrigin(request);
  const form = await request.formData();
  const recipient = String(form.get("recipient") ?? "").trim().slice(0, 300);
  const letter = await getPrivateLetter(env.DB);
  const changed = recipient.toLowerCase() !== letter.recipientLabel.trim().toLowerCase();
  if (changed && letter.recipientIds.length && ((await chatRoom()?.messageCount()) ?? 0) > 0) {
    return { error: "Զրույցում արդեն նամակներ կան. ստացողին փոխել չի կարելի, այլապես նոր մարդը կտեսներ ամբողջ զրույցը։ Նախ սեղմեք «Ջնջել ամբողջ զրույցը»։" };
  }
  const found = await findRecipientAccounts(env.DB, recipient);
  if (!found.ids.length) return { error: "Այս հասցեով հաշիվ չգտնվեց։ Նա պետք է գոնե մեկ անգամ մտած լինի կայք (Google-ով կամ Telegram-ով)։" };
  await savePrivateLetter(env.DB, { ...letter, recipientIds: found.ids, recipientLabel: recipient, updatedAt: new Date().toISOString() });
  // Նախկին ստացողը (օր.՝ փորձնական հաշիվը) այլևս ոչինչ չի ստանում, նույնիսկ եթե էջը բաց է։
  // Ամեն պահելիս. նախկին ստացողի հաշիվները (եթե կան) հեռացվում են, նույն ստացողինը՝ ոչ։
  await chatRoom()?.resetRecipient(found.ids);
  return { saved: `Պահված է։ Ստացողը՝ ${found.names.join(", ") || recipient} (${found.ids.length} հաշիվ)։` };
}

export default function PrivateChatPage({ loaderData, actionData }: Route.ComponentProps) {
  return <PrivateChat side={loaderData.side} recipient={loaderData.recipient} diagnostics={loaderData.diagnostics} actionData={actionData} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} />;
}
