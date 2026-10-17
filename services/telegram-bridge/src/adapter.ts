import type { BridgeCategory, BridgeMedia, BridgePost } from "../../../shared/telegram-bridge-contract";

export type TelegramPost = Omit<
  BridgePost,
  "categoryId" | "categoryName" | "categorySlug"
>;

export type AdapterPage = {
  posts: TelegramPost[];
  nextCursor: string | null;
};

export class InvalidPaginationCursorError extends Error {
  constructor() {
    super("Invalid pagination cursor.");
    this.name = "InvalidPaginationCursorError";
  }
}

export type HistoryOptions = {
  cursor: string | null;
  limit: number;
  query?: string;
  chatId?: string;
  topicId?: number;
  signal: AbortSignal;
};

export type TopicOptions = {
  refresh: boolean;
  signal: AbortSignal;
};

export type MediaRequest = {
  chatId: string;
  messageId: number;
  mediaIndex: number;
  start: number;
  end: number;
  thumbnail?: boolean;
  signal: AbortSignal;
};

export type MediaDescriptor = BridgeMedia & {
  chatId: string;
  messageId: number;
  thumbnail?: boolean;
};

export type TelegramAdmin = { userId: string; displayName: string; username: string | null };

export type ContentChange = { kind: "new" | "edited" | "deleted"; chatId: string; messageIds: number[] };

export interface TelegramAdapter {
  connect(): Promise<void>;
  close(): Promise<void>;
  listTopics(options: TopicOptions): Promise<BridgeCategory[]>;
  listHistory(options: HistoryOptions): Promise<AdapterPage>;
  search(options: HistoryOptions): Promise<AdapterPage>;
  getPost(chatId: string, messageId: number, signal: AbortSignal): Promise<TelegramPost | null>;
  getMediaDescriptor(chatId: string, messageId: number, mediaIndex: number, signal: AbortSignal, thumbnail?: boolean): Promise<MediaDescriptor | null>;
  streamMedia(request: MediaRequest): AsyncIterable<Uint8Array>;
  runtimeState?(): { inflightOperations: number };
  /** Current human admins of a chat (bots excluded). */
  listAdmins?(chatId: string, signal: AbortSignal): Promise<TelegramAdmin[]>;
  /** Subscribe to new, edited and deleted messages in allowed chats; returns an unsubscribe function. */
  onContentChange?(handler: (change: ContentChange) => void): () => void;
}
