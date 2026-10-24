import { env } from "cloudflare:workers";

import type { Clock } from "../../workers/clock";

type ClockBinding = { CLOCK?: DurableObjectNamespace<Clock> };

function clock(name: "sync" | "reminders") {
  const namespace = (env as ClockBinding).CLOCK;
  return namespace ? namespace.get(namespace.idFromName(name)) : null;
}

/** A new or edited post in the group: the sync starts 15 minutes after the last one. */
export async function syncSoon() {
  await clock("sync")?.syncSoon();
}

/** A reminder was set, moved or snoozed: the clock wakes at the next one's minute. */
export async function scheduleReminders() {
  await clock("reminders")?.scheduleReminders();
}
