import assert from "node:assert/strict";
import test from "node:test";

import type { BridgeCategory } from "../shared/telegram-bridge-contract";
import type { HistoryOptions, TelegramAdmin, TelegramPost } from "../services/telegram-bridge/src/adapter";
import {
  mayPublish,
  syncTelegramChanges,
  syncTelegramLibrary,
  type AuthorTally,
  type CloudLibrarySyncTarget,
  type PublisherPolicy,
  type SyncMaterial,
} from "../services/telegram-bridge/src/cloud-sync";
import { MOCK_CHAT_ID, MockTelegramAdapter } from "../services/telegram-bridge/src/mock-adapter";

const ADMIN = "1001";
const STRANGER = "2002";

/** Post 101 is written by a non-admin; everything else by the admin. */
class AuthoredAdapter extends MockTelegramAdapter {
  private author(post: TelegramPost): TelegramPost {
    return { ...post, authorId: post.messageId === 101 ? STRANGER : ADMIN, authorName: post.messageId === 101 ? "Անծանոթ" : "Ադմին" };
  }
  override async listHistory(options: HistoryOptions) {
    const page = await super.listHistory(options);
    return { ...page, posts: page.posts.map((post) => this.author(post)) };
  }
  override async getPost(chatId: string, messageId: number, signal: AbortSignal) {
    const post = await super.getPost(chatId, messageId, signal);
    return post ? this.author(post) : null;
  }
  async listAdmins(): Promise<TelegramAdmin[]> {
    return [{ userId: ADMIN, displayName: "Ադմին", username: null }];
  }
}

class PolicyTarget implements CloudLibrarySyncTarget {
  readonly materials = new Set<number>();
  readonly deleted = new Set<number>();
  readonly extraAllowed = new Set<string>();
  authors: AuthorTally[] = [];
  async beginRun() { return "run"; }
  async upsertSource() {}
  async upsertTopic(_topic: BridgeCategory) {}
  async getCheckpoint() { return null; }
  async stageMaterial() { return { mediaToUpload: [] }; }
  async uploadMedia() {}
  async commitMaterial(material: SyncMaterial) {
    this.materials.add(material.post.messageId);
    this.deleted.delete(material.post.messageId);
  }
  async recordFailure() {}
  async saveCheckpoint() {}
  async finishRun() {}
  async syncPublishers(input: { admins: TelegramAdmin[] | null }): Promise<PublisherPolicy> {
    return { allowed: new Set([...(input.admins ?? []).map((admin) => admin.userId), ...this.extraAllowed]), blocked: new Set() };
  }
  async recordAuthors(input: { authors: AuthorTally[] }) { this.authors = input.authors; }
  async markDeleted(input: { messageIds: number[] }) {
    for (const id of input.messageIds) { this.deleted.add(id); this.materials.delete(id); }
  }
  async listStoredMessageIds() { return [...this.materials, 999_999]; }
}

test("only admins, allowed users and anonymous admins may publish; blocks win", () => {
  const policy = { allowed: new Set([ADMIN]), blocked: new Set(["3003"]) };
  assert.equal(mayPublish(policy, "-100", ADMIN), true);
  assert.equal(mayPublish(policy, "-100", STRANGER), false);
  assert.equal(mayPublish(policy, "-100", "-100"), true, "anonymous admin posts as the group");
  assert.equal(mayPublish(policy, "-100", "-100777"), false, "posting as some other channel needs an explicit allow");
  assert.equal(mayPublish({ ...policy, allowed: new Set([ADMIN, "-100777"]) }, "-100", "-100777"), true);
  assert.equal(mayPublish(policy, "-100", null), true);
  assert.equal(mayPublish({ ...policy, allowed: new Set([ADMIN, "3003"]) }, "-100", "3003"), false);
  assert.equal(mayPublish(null, "-100", STRANGER), true, "without a policy everything publishes");
});

test("reconcile withholds non-admin posts, records authors and removes posts deleted offline", async () => {
  const target = new PolicyTarget();
  target.materials.add(999_999);
  await syncTelegramLibrary({ adapter: new AuthoredAdapter(), target, chatId: MOCK_CHAT_ID, mode: "reconcile", signal: new AbortController().signal });
  assert.equal(target.materials.has(101), false);
  assert.equal(target.deleted.has(101), true);
  assert.equal(target.materials.has(102), true);
  assert.equal(target.deleted.has(999_999), true, "a stored post missing from Telegram is taken down");
  const stranger = target.authors.find((author) => author.userId === STRANGER);
  assert.equal(stranger?.withheld, 1);
  assert.equal(stranger?.displayName, "Անծանոթ");

  // Allowing the author on the admin page publishes their post on the next sync.
  target.extraAllowed.add(STRANGER);
  await syncTelegramChanges({ adapter: new AuthoredAdapter(), target, chatId: MOCK_CHAT_ID, changes: [{ kind: "edited", chatId: MOCK_CHAT_ID, messageIds: [101] }], signal: new AbortController().signal });
  assert.equal(target.materials.has(101), true);
});

test("live changes sync new posts and take down deleted ones", async () => {
  const target = new PolicyTarget();
  const signal = new AbortController().signal;
  const result = await syncTelegramChanges({
    adapter: new AuthoredAdapter(), target, chatId: MOCK_CHAT_ID, signal,
    changes: [
      { kind: "new", chatId: MOCK_CHAT_ID, messageIds: [102] },
      { kind: "new", chatId: "-1", messageIds: [104] },
    ],
  });
  assert.equal(result.synced, 1);
  assert.deepEqual([...target.materials], [102]);
  await syncTelegramChanges({ adapter: new AuthoredAdapter(), target, chatId: MOCK_CHAT_ID, signal, changes: [{ kind: "deleted", chatId: MOCK_CHAT_ID, messageIds: [102] }] });
  assert.equal(target.materials.has(102), false);
  assert.equal(target.deleted.has(102), true);
});
