import { sendWebPush, type PushKeys, type PushSubscriptionRow } from "./web-push.server";
import { sundayRecipients } from "./liturgy.server";

/**
 * Կիրակնօրյա ծանուցումը (կիրակի ~13:00, Երևանի ժամով)։ Ուղարկվում է խմբերով, որ Worker-ի
 * սահմանը չանցնի. Clock-ը կանչում է այս ֆունկցիան այնքան անգամ, մինչև ցուցակը վերջանա։
 */
const BATCH = 12;
const TITLE = "🕊 Օրհնյալ կիրակի";
const BODY = "Այսօր մասնակցե՞լ եք Սուրբ Պատարագին։ Նշեք Ձեր տարվա ճանապարհում։";

type Options = { token: string | null; publicUrl: string; pushKeys: PushKeys | null };

/** Մեկ խումբ. վերադարձնում է հաջորդ խմբի սկիզբը կամ null, երբ բոլորն ստացել են։ */
export async function sendSundayBatch(db: D1Database, day: string, afterId: string, options: Options) {
  const recipients = await sundayRecipients(db, day, afterId, BATCH);
  const url = `${options.publicUrl}/?sunday=1`;
  for (const person of recipients) {
    if (options.pushKeys) {
      const { results } = await db.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?").bind(person.id).all<PushSubscriptionRow>();
      for (const subscription of results) {
        const outcome = await sendWebPush(subscription, { title: TITLE, body: BODY, url, tag: `sunday-${day}` }, options.pushKeys).catch(() => "failed" as const);
        if (outcome === "gone") await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(subscription.endpoint).run();
      }
    }
    // Telegram-ով մուտք գործածներին՝ բոտի հաղորդագրություն կոճակով (Google հաշիվները՝ միայն բրաուզերում)։
    if (options.token && /^\d+$/u.test(person.telegram_id)) {
      await fetch(`https://api.telegram.org/bot${options.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: Number(person.telegram_id),
          text: `${TITLE}\n\n${BODY}`,
          reply_markup: { inline_keyboard: [[{ text: "🕯 Պատասխանել", web_app: { url } }]] },
        }),
      }).catch(() => null);
    }
  }
  return recipients.length === BATCH ? recipients[recipients.length - 1].id : null;
}
