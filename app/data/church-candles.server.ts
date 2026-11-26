// 3D եկեղեցու «Վառել մոմ»՝ անանուն, օրը մեկ անգամ ամեն սարքից ամեն եկեղեցում (մինչև Երևանի օրվա վերջ)։
import { CANDLE_SLOTS } from "../church3d/model";
import { TEMPLATES } from "../church3d/templates";
import { yerevanDay } from "../utils/liturgy";

export type CandleState = { day: string; total: number; slots: number[] };

const CHURCH_ID = /^(template:[a-z0-9-]{1,40}|place:[a-z0-9-]{1,80})$/u;
const TOKEN = /^[a-z0-9-]{16,64}$/u;

/** Եկեղեցու նշանը ճիշտ է և այդպիսի եկեղեցի կա (ձևանմուշ կամ հրապարակված սրբավայր)։ */
export async function isKnownChurch(db: D1Database, church: unknown): Promise<boolean> {
  if (typeof church !== "string" || !CHURCH_ID.test(church)) return false;
  const [kind, id] = church.split(":");
  if (kind === "template") return TEMPLATES.some((template) => template.id === id);
  return Boolean(await db.prepare("SELECT 1 FROM places WHERE id = ? AND published = 1").bind(id).first());
}

export async function candleState(db: D1Database, church: string, day = yerevanDay()): Promise<CandleState> {
  const [slots, total] = await Promise.all([
    db.prepare("SELECT slot FROM church_candles WHERE church = ? AND day = ? ORDER BY slot").bind(church, day).all<{ slot: number }>(),
    db.prepare("SELECT total FROM church_candle_totals WHERE church = ? AND day = ?").bind(church, day).first<{ total: number }>(),
  ]);
  return { day, total: total?.total ?? 0, slots: slots.results.map((row) => row.slot) };
}

async function visitorHash(day: string, church: string, token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${day}|${church}|${token}`));
  return [...new Uint8Array(bytes).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Վառում է մոմ. նույն սարքը նույն օրը նույն եկեղեցում երկրորդ անգամ չի կարող։ */
export async function lightCandle(db: D1Database, church: string, token: unknown): Promise<{ ok: boolean; already?: boolean; slot?: number; state: CandleState }> {
  const day = yerevanDay();
  if (typeof token !== "string" || !TOKEN.test(token)) return { ok: false, state: await candleState(db, church, day) };
  const visitor = await visitorHash(day, church, token);
  const existing = await db.prepare("SELECT slot FROM church_candles WHERE church = ? AND day = ? AND visitor = ?").bind(church, day, visitor).first<{ slot: number }>();
  if (existing) return { ok: false, already: true, slot: existing.slot, state: await candleState(db, church, day) };
  const row = await db.prepare(
    "INSERT INTO church_candle_totals (church, day, total) VALUES (?, ?, 1) ON CONFLICT (church, day) DO UPDATE SET total = total + 1 RETURNING total",
  ).bind(church, day).first<{ total: number }>();
  const slot = ((row?.total ?? 1) - 1) % CANDLE_SLOTS;
  await db.prepare("INSERT OR REPLACE INTO church_candles (church, day, slot, visitor, lit_at) VALUES (?, ?, ?, ?, ?)").bind(church, day, slot, visitor, Date.now()).run();
  return { ok: true, slot, state: await candleState(db, church, day) };
}
