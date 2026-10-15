import type { BridgeMedia, BridgePost } from "../../../shared/telegram-bridge-contract";

export type TelegramPost = Omit<
  BridgePost,
  "categoryId" | "categoryName" | "categorySlug"
>;

export type AdapterPage = {
  posts: TelegramPost[];
  nextCursor: string | null;
};

export type HistoryOptions = {
  cursor: string | null;
  limit: number;
  query?: string;
  signal: AbortSignal;
};

export type MediaRequest = {
  chatId: string;
  messageId: number;
  mediaIndex: number;
  start: number;
  end: number;
  signal: AbortSignal;
};

export type MediaDescriptor = BridgeMedia & {
  chatId: string;
  messageId: number;
};

export interface TelegramAdapter {
  connect(): Promise<void>;
  close(): Promise<void>;
  listHistory(options: HistoryOptions): Promise<AdapterPage>;
  search(options: HistoryOptions): Promise<AdapterPage>;
  getPost(chatId: string, messageId: number, signal: AbortSignal): Promise<TelegramPost | null>;
  getMediaDescriptor(chatId: string, messageId: number, mediaIndex: number, signal: AbortSignal): Promise<MediaDescriptor | null>;
  streamMedia(request: MediaRequest): AsyncIterable<Uint8Array>;
}
