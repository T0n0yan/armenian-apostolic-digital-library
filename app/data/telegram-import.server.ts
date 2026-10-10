import {
  createContentFingerprint,
  normalizeContentText,
  normalizeSearchText,
} from "./material-content.server";

const MAX_EXPORT_SIZE_BYTES = 8 * 1024 * 1024;
const TELEGRAM_PUBLIC_URL_PATTERN =
  /https:\/\/t\.me\/([a-zA-Z0-9_]+)\/(\d+)\/(\d+)/g;

const CATEGORY_BY_TOPIC_TITLE = new Map([
  ["ավետարանի ուսուցում", "category_gospel_teachings"],
  ["աղոթքներ", "category_prayers"],
  ["սաղմոսներ", "category_psalms"],
  ["սրբերի կյանքը", "category_saints_lives"],
  ["օրվա ընթերցումներ", "category_daily_readings"],
  ["հարցեր աստվածաշնչից", "category_bible_questions"],
  ["հարցթր աստվածաշնչից", "category_bible_questions"],
]);

type UnknownRecord = Record<string, unknown>;

type TelegramExportDocument = {
  id: string;
  name: string;
  type: string;
  messages: UnknownRecord[];
};

type TopicDefinition = {
  topicId: number;
  title: string;
  categoryId: string;
};

type ExistingSourceRow = {
  id: string;
  username: string | null;
};

type ExistingTopicRow = {
  topic_id: number;
  title: string;
  category_id: string;
};

type ExistingMaterialRow = {
  id: string;
  telegram_source_id: string | null;
  telegram_message_id: number | null;
  telegram_url_key: string;
  category_id: string;
  number_value: number | null;
  date_value: string | null;
  search_title: string;
  content_fingerprint: string | null;
  content_hash: string | null;
};

type PreparedMaterial = {
  id: string;
  messageId: number;
  topicId: number;
  categoryId: string;
  title: string;
  searchTitle: string;
  telegramUrl: string;
  numberValue: number | null;
  dateValue: string | null;
  sortOrder: number;
  publishedAt: string;
  editedAt: string | null;
  contentKind: string;
  contentText: string;
  searchBody: string;
  mediaTypes: string;
  contentFingerprint: string | null;
  contentHash: string;
  sourcePayload: string;
  state: "added" | "updated" | "unchanged" | "conflict" | "duplicate";
  existingId: string | null;
};

type MaterialUniquenessFields = Pick<
  PreparedMaterial,
  | "categoryId"
  | "numberValue"
  | "dateValue"
  | "searchTitle"
  | "contentFingerprint"
>;

type PreparedImport = {
  sourceId: string;
  chatId: string;
  chatTitle: string;
  chatType: string;
  username: string;
  fileName: string;
  topics: TopicDefinition[];
  materials: PreparedMaterial[];
  summary: TelegramImportPreview;
};

export type TelegramImportPreview = {
  chatTitle: string;
  username: string;
  fileName: string;
  dateFrom: string | null;
  dateTo: string | null;
  totalMessages: number;
  addedCount: number;
  updatedCount: number;
  unchangedCount: number;
  skippedCount: number;
  conflictCount: number;
  duplicateCount: number;
  estimatedBytes: number;
  topics: Array<{
    topicId: number;
    title: string;
    messageCount: number;
  }>;
  warnings: string[];
};

export class TelegramImportError extends Error {
  constructor(
    public readonly code:
      | "file-too-large"
      | "invalid-file"
      | "invalid-export"
      | "missing-username"
      | "no-messages",
  ) {
    super(code);
    this.name = "TelegramImportError";
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: UnknownRecord, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readInteger(record: UnknownRecord, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function normalizeTopicTitle(value: string) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("hy-AM");
}

function flattenTextNode(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(flattenTextNode).join("");
  }

  if (isRecord(value) && "text" in value) {
    return flattenTextNode(value.text);
  }

  return "";
}

function collectRichPlainText(value: unknown, output: string[]) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRichPlainText(item, output);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (value.type === "plain" && typeof value.text === "string") {
    output.push(value.text);
    return;
  }

  for (const child of Object.values(value)) {
    collectRichPlainText(child, output);
  }
}

function getRichText(record: UnknownRecord) {
  const output: string[] = [];
  collectRichPlainText(record.rich_message, output);
  return normalizeContentText(output.join("\n"));
}

function getPollText(record: UnknownRecord) {
  if (!isRecord(record.poll)) {
    return "";
  }

  const question = readString(record.poll, "question") ?? "";
  const answers = Array.isArray(record.poll.answers)
    ? record.poll.answers
        .filter(isRecord)
        .map((answer) => readString(answer, "text") ?? "")
        .filter(Boolean)
    : [];

  return normalizeContentText([question, ...answers].filter(Boolean).join("\n"));
}

function getMessageContent(record: UnknownRecord) {
  const standardText = normalizeContentText(flattenTextNode(record.text));
  const richText = getRichText(record);
  const pollText = getPollText(record);
  return normalizeContentText([standardText || richText, pollText].filter(Boolean).join("\n"));
}

function collectRichHeadings(record: UnknownRecord) {
  if (!isRecord(record.rich_message) || !Array.isArray(record.rich_message.blocks)) {
    return [];
  }

  return record.rich_message.blocks
    .filter((block) => isRecord(block) && block.type === "heading")
    .map((block) => {
      const output: string[] = [];
      collectRichPlainText(block, output);
      return normalizeContentText(output.join(" "));
    })
    .filter(Boolean);
}

function truncateTitle(value: string) {
  const normalized = normalizeContentText(value).replace(/\n+/g, " ");
  if (normalized.length <= 240) {
    return normalized;
  }
  return `${normalized.slice(0, 237).trimEnd()}…`;
}

function firstMeaningfulLine(value: string) {
  return (
    value
      .split("\n")
      .map((line) => line.replace(/^[\s\p{P}\p{S}]+/u, "").trim())
      .find((line) => line.length >= 2) ?? ""
  );
}

function looksLikeCalendarHeading(value: string) {
  return /^\d{1,2}\s+\S+[,՝]?\s+\d{4}\b/u.test(value);
}

function deriveTitle(
  record: UnknownRecord,
  contentText: string,
  categoryId: string,
  messageId: number,
) {
  if (isRecord(record.poll)) {
    const pollQuestion = readString(record.poll, "question");
    if (pollQuestion) {
      return truncateTitle(pollQuestion);
    }
  }

  const firstLine = firstMeaningfulLine(contentText);
  if (categoryId === "category_saints_lives" && firstLine) {
    return truncateTitle(firstLine);
  }

  const headings = collectRichHeadings(record);
  const preferredHeading =
    categoryId === "category_daily_readings"
      ? headings.find((heading) => !looksLikeCalendarHeading(heading))
      : headings[0];

  if (preferredHeading) {
    return truncateTitle(preferredHeading);
  }

  const mediaTitle = readString(record, "title");

  if (categoryId === "category_psalms" && mediaTitle) {
    if (firstLine && normalizeSearchText(firstLine) !== normalizeSearchText(mediaTitle)) {
      return truncateTitle(`${mediaTitle} — ${firstLine}`);
    }
    return truncateTitle(mediaTitle);
  }

  return truncateTitle(firstLine || mediaTitle || `Telegram նյութ #${messageId}`);
}

const SAINT_SORT_ORDERS: Record<string, number> = {
  "սուրբ մարիամ աստվածածին": 10,
  "սուրբ ադամ նախահայր": 20,
  "սուրբ աբել արդար": 30,
  "սուրբ սեթ նախահայր": 40,
};

function getSortOrder(categoryId: string, title: string, messageId: number) {
  if (categoryId !== "category_saints_lives") return 0;
  return SAINT_SORT_ORDERS[normalizeSearchText(title)] ?? 10000 + messageId;
}

function isCategoryIntroduction(
  categoryId: string,
  contentText: string,
  numberValue: number | null,
) {
  if (categoryId === "category_psalms") return numberValue === null;
  if (categoryId !== "category_saints_lives") return false;

  const firstLine = normalizeSearchText(firstMeaningfulLine(contentText))
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
  return firstLine === "սրբերի կյանքը";
}

function getMediaTypes(record: UnknownRecord) {
  const mediaTypes = new Set<string>();
  const mediaType = readString(record, "media_type");

  if (mediaType === "audio_file") mediaTypes.add("audio");
  if (mediaType === "video_file") mediaTypes.add("video");
  if (mediaType && mediaType !== "audio_file" && mediaType !== "video_file") {
    mediaTypes.add(mediaType);
  }

  if (isRecord(record.rich_message) && Array.isArray(record.rich_message.blocks)) {
    for (const block of record.rich_message.blocks) {
      if (
        isRecord(block) &&
        (block.type === "photo" || block.type === "video" || block.type === "audio")
      ) {
        mediaTypes.add(block.type);
      }
    }
  }

  if (isRecord(record.poll)) mediaTypes.add("poll");
  return [...mediaTypes].sort();
}

function getContentKind(record: UnknownRecord, mediaTypes: string[]) {
  if (isRecord(record.poll)) return "poll";
  if (isRecord(record.rich_message)) return "rich";
  if (mediaTypes.length > 0) return "media";
  return "text";
}

function getPsalmNumber(title: string, contentText: string) {
  const match = `${title}\n${contentText}`.match(/(?:ՍԱՂՄՈՍ|Սաղմոս)\s*(\d{1,3})/u);
  return match ? Number(match[1]) : null;
}

function getIsoDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function getDateValue(
  categoryId: string,
  contentText: string,
  publishedAt: string,
) {
  if (categoryId !== "category_daily_readings") {
    return publishedAt.slice(0, 10);
  }

  return /^\d{1,2}\s+\p{L}/u.test(contentText) ? publishedAt.slice(0, 10) : null;
}

function getUniquenessKey(material: MaterialUniquenessFields) {
  if (material.categoryId === "category_psalms" && material.numberValue !== null) {
    return `psalm:${material.numberValue}`;
  }
  if (
    material.categoryId === "category_daily_readings" &&
    material.dateValue !== null
  ) {
    return `daily:${material.dateValue}`;
  }
  if (
    material.categoryId === "category_prayers" &&
    material.contentFingerprint
  ) {
    return `prayer:${material.contentFingerprint}`;
  }
  if (
    material.categoryId === "category_saints_lives" ||
    material.categoryId === "category_gospel_teachings" ||
    material.categoryId === "category_bible_questions" ||
    material.categoryId === "category_holy_sites_armenia"
  ) {
    return `title:${material.categoryId}:${material.searchTitle}`;
  }
  return null;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseExportDocument(raw: unknown): TelegramExportDocument {
  if (!isRecord(raw) || !Array.isArray(raw.messages)) {
    throw new TelegramImportError("invalid-export");
  }

  const id = raw.id;
  const name = raw.name;
  const type = raw.type;

  if (
    (typeof id !== "number" && typeof id !== "string") ||
    typeof name !== "string" ||
    typeof type !== "string"
  ) {
    throw new TelegramImportError("invalid-export");
  }

  return {
    id: String(id),
    name: normalizeContentText(name),
    type,
    messages: raw.messages.filter(isRecord),
  };
}

async function readExportFile(file: File) {
  if (file.size === 0 || !file.name.toLocaleLowerCase().endsWith(".json")) {
    throw new TelegramImportError("invalid-file");
  }

  if (file.size > MAX_EXPORT_SIZE_BYTES) {
    throw new TelegramImportError("file-too-large");
  }

  try {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    return parseExportDocument(JSON.parse(text));
  } catch (error) {
    if (error instanceof TelegramImportError) throw error;
    throw new TelegramImportError("invalid-export");
  }
}

function getExportTopics(document: TelegramExportDocument) {
  const topics: Array<{ topicId: number; title: string }> = [];

  for (const message of document.messages) {
    if (message.type !== "service" || message.action !== "topic_created") continue;
    const topicId = readInteger(message, "id");
    const title = readString(message, "title");
    if (topicId === null || !title) continue;
    topics.push({ topicId, title: normalizeContentText(title) });
  }

  return topics;
}

function detectUsername(document: TelegramExportDocument) {
  const topicIds = new Set(getExportTopics(document).map((topic) => topic.topicId));
  const messageIds = new Set(
    document.messages
      .filter((message) => message.type === "message")
      .map((message) => readInteger(message, "id"))
      .filter((id): id is number => id !== null),
  );
  const serialized = JSON.stringify(document.messages);

  for (const match of serialized.matchAll(TELEGRAM_PUBLIC_URL_PATTERN)) {
    const topicId = Number(match[2]);
    const messageId = Number(match[3]);
    if (topicIds.has(topicId) && messageIds.has(messageId)) {
      return match[1].toLocaleLowerCase();
    }
  }

  return null;
}

async function loadExistingSource(database: D1Database, chatId: string) {
  return database
    .prepare("SELECT id, username FROM telegram_sources WHERE chat_id = ?")
    .bind(chatId)
    .first<ExistingSourceRow>();
}

async function loadExistingTopics(database: D1Database, sourceId: string) {
  const { results } = await database
    .prepare(
      `SELECT topic_id, title, category_id
       FROM telegram_topics
       WHERE source_id = ?`,
    )
    .bind(sourceId)
    .all<ExistingTopicRow>();
  return results;
}

async function loadExistingMaterials(database: D1Database) {
  const { results } = await database
    .prepare(
      `SELECT
         id,
         telegram_source_id,
         telegram_message_id,
         telegram_url_key,
         category_id,
         number_value,
         date_value,
         search_title,
         content_fingerprint,
         content_hash
       FROM materials`,
    )
    .all<ExistingMaterialRow>();
  return results;
}

function createTopicDefinitions(
  exportTopics: Array<{ topicId: number; title: string }>,
  existingTopics: ExistingTopicRow[],
) {
  const topics = new Map<number, TopicDefinition>();

  for (const topic of existingTopics) {
    topics.set(topic.topic_id, {
      topicId: topic.topic_id,
      title: topic.title,
      categoryId: topic.category_id,
    });
  }

  for (const topic of exportTopics) {
    const categoryId = CATEGORY_BY_TOPIC_TITLE.get(normalizeTopicTitle(topic.title));
    if (!categoryId) continue;
    topics.set(topic.topicId, { ...topic, categoryId });
  }

  return topics;
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

async function prepareTelegramImport(
  database: D1Database,
  file: File,
): Promise<PreparedImport> {
  const document = await readExportFile(file);
  const contentMessages = document.messages.filter((message) => message.type === "message");

  if (contentMessages.length === 0) {
    throw new TelegramImportError("no-messages");
  }

  const existingSource = await loadExistingSource(database, document.id);
  const sourceId = existingSource?.id ?? `telegram_source_${document.id}`;
  const username = existingSource?.username ?? detectUsername(document);

  if (!username) {
    throw new TelegramImportError("missing-username");
  }

  const [existingTopics, existingMaterials] = await Promise.all([
    loadExistingTopics(database, sourceId),
    loadExistingMaterials(database),
  ]);
  const topicsById = createTopicDefinitions(getExportTopics(document), existingTopics);
  const existingByIdentity = new Map<string, ExistingMaterialRow>();
  const existingByUrl = new Map<string, ExistingMaterialRow>();
  const existingByUniqueKey = new Map<string, ExistingMaterialRow>();

  for (const material of existingMaterials) {
    if (material.telegram_source_id && material.telegram_message_id !== null) {
      existingByIdentity.set(
        `${material.telegram_source_id}:${material.telegram_message_id}`,
        material,
      );
    }
    existingByUrl.set(material.telegram_url_key, material);

    const uniquenessKey = getUniquenessKey({
      categoryId: material.category_id,
      numberValue: material.number_value,
      dateValue: material.date_value,
      searchTitle: material.search_title,
      contentFingerprint: material.content_fingerprint,
    });
    if (uniquenessKey && !existingByUniqueKey.has(uniquenessKey)) {
      existingByUniqueKey.set(uniquenessKey, material);
    }
  }

  const warnings: string[] = [];
  const seenMessageIds = new Set<number>();
  const skippedMessageIds: number[] = [];
  const ignoredIntroductionMessageIds: number[] = [];
  const duplicateMessageIds: number[] = [];
  const preparedMaterials = (
    await Promise.all(
      contentMessages.map(async (message): Promise<PreparedMaterial | null> => {
        const messageId = readInteger(message, "id");
        const topicId = readInteger(message, "reply_to_message_id");

        if (messageId === null || topicId === null) {
          skippedMessageIds.push(messageId ?? -1);
          return null;
        }

        if (seenMessageIds.has(messageId)) {
          duplicateMessageIds.push(messageId);
          return null;
        }
        seenMessageIds.add(messageId);

        const topic = topicsById.get(topicId);
        if (!topic) {
          skippedMessageIds.push(messageId);
          return null;
        }

        const contentText = getMessageContent(message);
        const mediaTypesArray = getMediaTypes(message);
        const contentKind = getContentKind(message, mediaTypesArray);
        const title = deriveTitle(message, contentText, topic.categoryId, messageId);
        const publishedAt = getIsoDate(readString(message, "date"));

        if (!publishedAt) {
          skippedMessageIds.push(messageId);
          return null;
        }

        const editedAt = getIsoDate(readString(message, "edited"));
        const telegramUrl = `https://t.me/${username}/${topicId}/${messageId}`;
        const sourcePayload = JSON.stringify(message);
        const mediaTypes = JSON.stringify(mediaTypesArray);
        const numberValue =
          topic.categoryId === "category_psalms"
            ? getPsalmNumber(title, contentText)
            : null;
        if (isCategoryIntroduction(topic.categoryId, contentText, numberValue)) {
          ignoredIntroductionMessageIds.push(messageId);
          return null;
        }
        const dateValue = getDateValue(topic.categoryId, contentText, publishedAt);
        const sortOrder = getSortOrder(topic.categoryId, title, messageId);
        const searchTitle = normalizeSearchText(title);
        const contentFingerprint = await createContentFingerprint(contentText);
        const hashInput = JSON.stringify({
          topicId,
          categoryId: topic.categoryId,
          title,
          telegramUrl,
          numberValue,
          dateValue,
          sortOrder,
          publishedAt,
          editedAt,
          contentKind,
          contentText,
          mediaTypes,
        });
        const contentHash = await sha256(hashInput);
        const identityMatch = existingByIdentity.get(`${sourceId}:${messageId}`) ?? null;
        const urlMatch = existingByUrl.get(telegramUrl) ?? null;
        const isConflict = Boolean(
          identityMatch && urlMatch && identityMatch.id !== urlMatch.id,
        );
        const existing = identityMatch ?? urlMatch;
        const uniquenessKey = getUniquenessKey({
          categoryId: topic.categoryId,
          numberValue,
          dateValue,
          searchTitle,
          contentFingerprint,
        });
        const uniquenessMatch = uniquenessKey
          ? existingByUniqueKey.get(uniquenessKey) ?? null
          : null;
        const isDuplicate = Boolean(
          uniquenessMatch && (!existing || uniquenessMatch.id !== existing.id),
        );
        const state: PreparedMaterial["state"] = isConflict
          ? "conflict"
          : isDuplicate
            ? "duplicate"
          : !existing
            ? "added"
            : existing.content_hash === contentHash &&
                existing.content_fingerprint === contentFingerprint &&
                existing.telegram_source_id === sourceId &&
                existing.telegram_message_id === messageId
              ? "unchanged"
              : "updated";

        return {
          id: existing?.id ?? `material_telegram_${document.id}_${messageId}`,
          messageId,
          topicId,
          categoryId: topic.categoryId,
          title,
          searchTitle,
          telegramUrl,
          numberValue,
          dateValue,
          sortOrder,
          publishedAt,
          editedAt,
          contentKind,
          contentText,
          searchBody: normalizeSearchText(contentText),
          mediaTypes,
          contentFingerprint,
          contentHash,
          sourcePayload,
          state,
          existingId: existing?.id ?? null,
        };
      }),
    )
  ).filter((material): material is PreparedMaterial => material !== null);

  const seenUniqueKeys = new Map<string, PreparedMaterial>();
  for (const material of preparedMaterials) {
    if (material.state === "conflict" || material.state === "duplicate") continue;
    const uniquenessKey = getUniquenessKey(material);
    if (!uniquenessKey) continue;

    const earlierMaterial = seenUniqueKeys.get(uniquenessKey);
    if (earlierMaterial && earlierMaterial.id !== material.id) {
      material.state = "duplicate";
      continue;
    }
    seenUniqueKeys.set(uniquenessKey, material);
  }

  if (skippedMessageIds.length > 0) {
    warnings.push(
      `${skippedMessageIds.length} նյութ չի ճանաչվել կամ կապված է դեռ չգրանցված թեմայի հետ։`,
    );
  }
  if (duplicateMessageIds.length > 0) {
    warnings.push(`${duplicateMessageIds.length} կրկնվող message ID բաց է թողնվել։`);
  }
  if (ignoredIntroductionMessageIds.length > 0) {
    warnings.push(
      `${ignoredIntroductionMessageIds.length} բաժնի ներածական գրառում չի ավելացվել հանրային ինդեքսում։`,
    );
  }
  const duplicateMaterialCount = preparedMaterials.filter(
    (material) => material.state === "duplicate",
  ).length;
  if (duplicateMaterialCount > 0) {
    warnings.push(
      `${duplicateMaterialCount} նյութ բաց է թողնվել, քանի որ նույն համարը, օրը, վերնագիրը կամ աղոթքի բովանդակությունն արդեն կա։`,
    );
  }

  const topicCounts = new Map<number, number>();
  for (const material of preparedMaterials) {
    topicCounts.set(material.topicId, (topicCounts.get(material.topicId) ?? 0) + 1);
  }

  const dates = preparedMaterials.map((material) => material.publishedAt).sort();
  const summary: TelegramImportPreview = {
    chatTitle: document.name,
    username,
    fileName: file.name,
    dateFrom: dates[0] ?? null,
    dateTo: dates.at(-1) ?? null,
    totalMessages: contentMessages.length,
    addedCount: preparedMaterials.filter((material) => material.state === "added").length,
    updatedCount: preparedMaterials.filter((material) => material.state === "updated").length,
    unchangedCount: preparedMaterials.filter((material) => material.state === "unchanged").length,
    skippedCount: contentMessages.length - preparedMaterials.length,
    conflictCount: preparedMaterials.filter((material) => material.state === "conflict").length,
    duplicateCount: duplicateMaterialCount,
    estimatedBytes: preparedMaterials.reduce(
      (total, material) =>
        total +
        byteLength(material.title) +
        byteLength(material.contentText) +
        byteLength(material.sourcePayload),
      0,
    ),
    topics: [...topicsById.values()]
      .map((topic) => ({
        topicId: topic.topicId,
        title: topic.title,
        messageCount: topicCounts.get(topic.topicId) ?? 0,
      }))
      .filter((topic) => topic.messageCount > 0)
      .sort((left, right) => left.topicId - right.topicId),
    warnings,
  };

  return {
    sourceId,
    chatId: document.id,
    chatTitle: document.name,
    chatType: document.type,
    username,
    fileName: file.name,
    topics: [...topicsById.values()],
    materials: preparedMaterials,
    summary,
  };
}

async function runStatementsInChunks(
  database: D1Database,
  statements: D1PreparedStatement[],
) {
  const chunkSize = 50;
  for (let index = 0; index < statements.length; index += chunkSize) {
    await database.batch(statements.slice(index, index + chunkSize));
  }
}

export async function previewTelegramExport(database: D1Database, file: File) {
  const prepared = await prepareTelegramImport(database, file);
  return prepared.summary;
}

export async function importTelegramExport(database: D1Database, file: File) {
  const prepared = await prepareTelegramImport(database, file);
  const now = new Date().toISOString();

  await database
    .prepare(
      `INSERT INTO telegram_sources (
         id, chat_id, title, chat_type, username, last_imported_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET
         title = excluded.title,
         chat_type = excluded.chat_type,
         username = COALESCE(excluded.username, telegram_sources.username),
         last_imported_at = excluded.last_imported_at,
         updated_at = excluded.updated_at`,
    )
    .bind(
      prepared.sourceId,
      prepared.chatId,
      prepared.chatTitle,
      prepared.chatType,
      prepared.username,
      now,
      now,
    )
    .run();

  await runStatementsInChunks(
    database,
    prepared.topics.map((topic) =>
      database
        .prepare(
          `INSERT INTO telegram_topics (
             source_id, topic_id, title, category_id, updated_at
           ) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(source_id, topic_id) DO UPDATE SET
             title = excluded.title,
             category_id = excluded.category_id,
             updated_at = excluded.updated_at`,
        )
        .bind(
          prepared.sourceId,
          topic.topicId,
          topic.title,
          topic.categoryId,
          now,
        ),
    ),
  );

  const writableMaterials = prepared.materials.filter(
    (material) => material.state === "added" || material.state === "updated",
  );
  await runStatementsInChunks(
    database,
    writableMaterials.map((material) => {
      if (material.existingId) {
        return database
          .prepare(
            `UPDATE materials SET
               title = ?,
               search_title = ?,
               category_id = ?,
               telegram_url = ?,
               telegram_url_key = ?,
               number_value = ?,
               date_value = ?,
               sort_order = ?,
               telegram_source_id = ?,
               telegram_message_id = ?,
               telegram_topic_id = ?,
               published_at = ?,
               edited_at = ?,
               content_kind = ?,
               content_text = ?,
               search_body = ?,
               media_types = ?,
               content_fingerprint = ?,
               content_hash = ?,
               source_payload = ?,
               updated_at = ?
             WHERE id = ?`,
          )
          .bind(
            material.title,
            material.searchTitle,
            material.categoryId,
            material.telegramUrl,
            material.telegramUrl,
            material.numberValue,
            material.dateValue,
            material.sortOrder,
            prepared.sourceId,
            material.messageId,
            material.topicId,
            material.publishedAt,
            material.editedAt,
            material.contentKind,
            material.contentText,
            material.searchBody,
            material.mediaTypes,
            material.contentFingerprint,
            material.contentHash,
            material.sourcePayload,
            now,
            material.existingId,
          );
      }

      return database
        .prepare(
          `INSERT INTO materials (
             id,
             title,
             search_title,
             category_id,
             telegram_url,
             telegram_url_key,
             number_value,
             date_value,
             sort_order,
             telegram_source_id,
             telegram_message_id,
             telegram_topic_id,
             published_at,
             edited_at,
             content_kind,
             content_text,
             search_body,
             media_types,
             content_fingerprint,
             content_hash,
             source_payload
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          material.id,
          material.title,
          material.searchTitle,
          material.categoryId,
          material.telegramUrl,
          material.telegramUrl,
          material.numberValue,
          material.dateValue,
          material.sortOrder,
          prepared.sourceId,
          material.messageId,
          material.topicId,
          material.publishedAt,
          material.editedAt,
          material.contentKind,
          material.contentText,
          material.searchBody,
          material.mediaTypes,
          material.contentFingerprint,
          material.contentHash,
          material.sourcePayload,
        );
    }),
  );

  await database
    .prepare(
      `INSERT INTO telegram_imports (
         id,
         source_id,
         file_name,
         range_started_at,
         range_ended_at,
         total_messages,
         added_count,
         updated_count,
         unchanged_count,
         skipped_count
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      `telegram_import_${crypto.randomUUID()}`,
      prepared.sourceId,
      prepared.fileName,
      prepared.summary.dateFrom,
      prepared.summary.dateTo,
      prepared.summary.totalMessages,
      prepared.summary.addedCount,
      prepared.summary.updatedCount,
      prepared.summary.unchangedCount,
      prepared.summary.skippedCount +
        prepared.summary.conflictCount +
        prepared.summary.duplicateCount,
    )
    .run();

  return prepared.summary;
}
