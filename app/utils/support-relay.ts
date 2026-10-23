/**
 * The support relay without state: the bot writes the reader's Telegram id into the message it
 * posts in the private support group (#u123), and an admin's reply to that message goes back to
 * the reader. Which topic a message belongs to comes from the bot's prompt the reader answered.
 */
export type SupportKind = "support" | "contact";

export const SUPPORT_PROMPTS: Record<SupportKind, string> = {
  support: "🛠 Գրեք խնդիրը մեկ հաղորդագրությամբ. կարող եք կցել նկար կամ էկրանի պատկեր։",
  contact: "✉️ Գրեք ձեր հարցը կամ առաջարկը մեկ հաղորդագրությամբ։",
};

const LABELS: Record<SupportKind, string> = { support: "🛠 Տեխնիկական", contact: "✉️ Հարց կամ առաջարկ" };

/** The kind of the bot's prompt the reader replied to; plain messages count as questions. */
export function supportKindFor(repliedText: string | undefined): SupportKind {
  return repliedText === SUPPORT_PROMPTS.support ? "support" : "contact";
}

export function supportHeader(kind: SupportKind, user: { id: number; first_name?: string; last_name?: string; username?: string }) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || "Անանուն";
  return `${LABELS[kind]} · ${name}${user.username ? ` @${user.username}` : ""} · #u${user.id}`;
}

/** The reader's Telegram id from a relayed message, or null when it isn't one. */
export function readerIdFrom(text: string | undefined) {
  const match = /#u(\d{1,20})\b/u.exec(text ?? "");
  return match ? Number(match[1]) : null;
}

/** Joins the header and the reader's text, cut to Telegram's limit. */
export function relayedText(header: string, body: string, limit: number) {
  const text = body ? `${header}\n\n${body}` : header;
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
