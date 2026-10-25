import { DurableObject } from "cloudflare:workers";

import { nextReminderTime, sendDueReminders } from "../app/data/reminders.server";
import { pushKeysFrom } from "../app/data/web-push.server";
import { dispatchCloudSync } from "../app/data/site-refresh.server";

/** How long after the last new post in the group the sync starts (posts often come in a row). */
export const SYNC_DELAY_MS = 15 * 60_000;
const RETRY_MS = 60_000;

type ClockEnv = {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  PUBLIC_URL?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_JWK?: string;
  VAPID_SUBJECT?: string;
  GITHUB_SYNC_TOKEN?: string;
  GITHUB_SYNC_REPO?: string;
};

/**
 * The site's alarm clock, in place of a cron that woke the Worker every minute. Two instances:
 * - "sync": a new post in the group sets it 15 minutes ahead (each further post moves it again),
 *   then the Telegram → cloud sync starts once for the whole batch;
 * - "reminders": set to the next reminder's minute; it sends what is due and sets itself again.
 */
export class Clock extends DurableObject<ClockEnv> {
  /** Starts the sync 15 minutes after the latest call. */
  async syncSoon() {
    await this.ctx.storage.put("job", "sync");
    const first = await this.ctx.storage.get<number>("syncFirst") ?? Date.now();
    await this.ctx.storage.put("syncFirst", first);
    await this.ctx.storage.put("syncAttempts", 0);
    await this.ctx.storage.setAlarm(Math.min(Date.now() + SYNC_DELAY_MS, first + 30 * 60_000));
  }

  /** Sets the alarm to the next reminder's time (after a reminder is set, moved or snoozed). */
  async scheduleReminders() {
    await this.ctx.storage.put("job", "reminders");
    const next = await nextReminderTime(this.env.DB);
    if (next === null) { await this.ctx.storage.deleteAlarm(); return null; }
    const at = Math.max(Date.now() + 1_000, next);
    const current = await this.ctx.storage.getAlarm();
    if (current === null || at < current || current < Date.now()) await this.ctx.storage.setAlarm(at);
    return at;
  }

  async alarm() {
    const job = await this.ctx.storage.get<string>("job");
    if (job === "sync") {
      const started = await dispatchCloudSync(this.env).catch(() => false);
      // Bounded retry: 1, 2, 4, 8, 16 minutes. Nightly reconciliation remains the fallback.
      const attempts = (await this.ctx.storage.get<number>("syncAttempts") ?? 0) + 1;
      if (!started && this.env.GITHUB_SYNC_TOKEN?.trim() && attempts <= 5) {
        await this.ctx.storage.put("syncAttempts", attempts);
        await this.ctx.storage.setAlarm(Date.now() + RETRY_MS * 2 ** (attempts - 1));
      } else {
        await this.ctx.storage.delete("syncFirst");
        await this.ctx.storage.delete("syncAttempts");
        if (!started) console.error("Cloud sync not started; retry budget exhausted or token missing");
      }
      return;
    }
    if (job !== "reminders" || !this.env.PUBLIC_URL) return;
    const { remaining } = await sendDueReminders(this.env.DB, {
      token: this.env.TELEGRAM_BOT_TOKEN?.trim() || null,
      publicUrl: this.env.PUBLIC_URL.replace(/\/$/u, ""),
      pushKeys: pushKeysFrom(this.env),
    });
    // More were due than one run may send, or a send failed: come back shortly.
    if (remaining) { await this.ctx.storage.setAlarm(Date.now() + (remaining === "retry" ? RETRY_MS : 1_000)); return; }
    const next = await nextReminderTime(this.env.DB);
    if (next !== null) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1_000, next));
  }
}
