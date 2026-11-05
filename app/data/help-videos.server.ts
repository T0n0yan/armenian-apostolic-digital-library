import { isHelpVideoId, type HelpConfig, type HelpVideoFile, type HelpVideoId } from "../utils/help-videos";

const KEY = "help_videos";

/** Վերբեռնված ֆայլերը և «ցույց տալ նոր այցելուներին»՝ site_settings-ից (մեկ JSON արժեք)։ */
export async function readHelpConfig(db: D1Database): Promise<HelpConfig> {
  const row = await db.prepare("SELECT value FROM site_settings WHERE key = ?").bind(KEY).first<{ value: string }>().catch(() => null);
  try {
    const value = JSON.parse(row?.value ?? "{}") as Partial<HelpConfig>;
    const files: HelpConfig["files"] = {};
    for (const [id, file] of Object.entries(value.files ?? {})) {
      if (isHelpVideoId(id) && file && typeof file.key === "string" && file.key.startsWith("help/")) files[id] = file as HelpVideoFile;
    }
    return { files, onboarding: value.onboarding === true };
  } catch {
    return { files: {}, onboarding: false };
  }
}

async function writeHelpConfig(db: D1Database, config: HelpConfig) {
  await db.prepare("INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
    .bind(KEY, JSON.stringify(config)).run();
}

/** Նոր ֆայլը՝ տեսանյութի տեղում. նախորդը R2-ից ջնջվում է։ */
export async function setHelpVideo(db: D1Database, media: R2Bucket, id: HelpVideoId, file: HelpVideoFile) {
  const config = await readHelpConfig(db);
  const previous = config.files[id];
  config.files[id] = file;
  await writeHelpConfig(db, config);
  if (previous && previous.key !== file.key) await media.delete(previous.key).catch(() => undefined);
}

export async function removeHelpVideo(db: D1Database, media: R2Bucket, id: HelpVideoId) {
  const config = await readHelpConfig(db);
  const previous = config.files[id];
  delete config.files[id];
  await writeHelpConfig(db, config);
  if (previous) await media.delete(previous.key).catch(() => undefined);
}

export async function setHelpOnboarding(db: D1Database, on: boolean) {
  const config = await readHelpConfig(db);
  config.onboarding = on;
  await writeHelpConfig(db, config);
}
