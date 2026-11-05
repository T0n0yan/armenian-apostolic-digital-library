import { HELP_DEFAULTS, cleanHelpTitle, isHelpId, type HelpConfig, type HelpItem, type HelpVideoFile } from "../utils/help-videos";

const KEY = "help_videos";

/** Ցանկը, վերբեռնված ֆայլերը և «ցույց տալ նոր այցելուներին»՝ site_settings-ից (մեկ JSON արժեք)։ */
export async function readHelpConfig(db: D1Database): Promise<HelpConfig> {
  const row = await db.prepare("SELECT value FROM site_settings WHERE key = ?").bind(KEY).first<{ value: string }>().catch(() => null);
  let value: Partial<HelpConfig> = {};
  try { value = JSON.parse(row?.value ?? "{}") as Partial<HelpConfig>; } catch { /* վնասված արժեք՝ սկզբնականը */ }
  const items = Array.isArray(value.items)
    ? value.items.filter((item): item is HelpItem => isHelpId(item?.id) && Boolean(cleanHelpTitle(item?.title))).map((item) => ({ id: item.id, title: cleanHelpTitle(item.title) }))
    : HELP_DEFAULTS.map((item) => ({ ...item }));
  const files: HelpConfig["files"] = {};
  for (const [id, file] of Object.entries(value.files ?? {})) {
    if (isHelpId(id) && file && typeof file.key === "string" && file.key.startsWith("help/")) files[id] = file as HelpVideoFile;
  }
  return { items, files, onboarding: value.onboarding === true };
}

async function writeHelpConfig(db: D1Database, config: HelpConfig) {
  await db.prepare("INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
    .bind(KEY, JSON.stringify(config)).run();
}

/** Նոր ֆայլը՝ տեսանյութի տեղում. նախորդը R2-ից ջնջվում է։ */
export async function setHelpVideo(db: D1Database, media: R2Bucket, id: string, file: HelpVideoFile) {
  const config = await readHelpConfig(db);
  if (!config.items.some((item) => item.id === id)) return false;
  const previous = config.files[id];
  config.files[id] = file;
  await writeHelpConfig(db, config);
  if (previous && previous.key !== file.key) await media.delete(previous.key).catch(() => undefined);
  return true;
}

export async function removeHelpVideo(db: D1Database, media: R2Bucket, id: string) {
  const config = await readHelpConfig(db);
  const previous = config.files[id];
  delete config.files[id];
  await writeHelpConfig(db, config);
  if (previous) await media.delete(previous.key).catch(() => undefined);
}

export async function helpItemExists(db: D1Database, id: string) {
  return (await readHelpConfig(db)).items.some((item) => item.id === id);
}

/** Նոր վերնագիր՝ ցանկի վերջում (տեսանյութը՝ հետո)։ */
export async function addHelpItem(db: D1Database, title: string) {
  const clean = cleanHelpTitle(title);
  if (!clean) return null;
  const config = await readHelpConfig(db);
  const id = `v-${Date.now().toString(36)}${crypto.randomUUID().slice(0, 4)}`;
  config.items.push({ id, title: clean });
  await writeHelpConfig(db, config);
  return id;
}

export async function renameHelpItem(db: D1Database, id: string, title: string) {
  const clean = cleanHelpTitle(title);
  const config = await readHelpConfig(db);
  const item = config.items.find((entry) => entry.id === id);
  if (!item || !clean) return;
  item.title = clean;
  await writeHelpConfig(db, config);
}

export async function moveHelpItem(db: D1Database, id: string, by: -1 | 1) {
  const config = await readHelpConfig(db);
  const from = config.items.findIndex((entry) => entry.id === id), to = from + by;
  if (from < 0 || to < 0 || to >= config.items.length) return;
  [config.items[from], config.items[to]] = [config.items[to], config.items[from]];
  await writeHelpConfig(db, config);
}

/** Վերնագիրը հանել ցանկից՝ իր տեսանյութով։ */
export async function removeHelpItem(db: D1Database, media: R2Bucket, id: string) {
  const config = await readHelpConfig(db);
  const previous = config.files[id];
  config.items = config.items.filter((entry) => entry.id !== id);
  delete config.files[id];
  await writeHelpConfig(db, config);
  if (previous) await media.delete(previous.key).catch(() => undefined);
}

export async function setHelpOnboarding(db: D1Database, on: boolean) {
  const config = await readHelpConfig(db);
  config.onboarding = on;
  await writeHelpConfig(db, config);
}
