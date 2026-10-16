import assert from "node:assert/strict";
import test from "node:test";

import bigInt from "big-integer";
import { Api } from "telegram";

import {
  collectDiscoverableTelegramChats,
  describeTelegramChat,
  maskTelegramAccountId,
} from "../services/telegram-bridge/src/chat-discovery";

const emptyPhoto = () => new Api.ChatPhotoEmpty();

test("chat discovery classifies basic groups, broadcast channels, supergroups, and forums", () => {
  const group = new Api.Chat({
    id: bigInt(123),
    title: "Test\nGroup",
    photo: emptyPhoto(),
    participantsCount: 2,
    date: 0,
    version: 1,
  });
  const broadcast = new Api.Channel({
    id: bigInt(234),
    title: "Broadcast Channel",
    username: "fixture_channel",
    photo: emptyPhoto(),
    date: 0,
    broadcast: true,
  });
  const supergroup = new Api.Channel({
    id: bigInt(345),
    title: "Test Supergroup",
    photo: emptyPhoto(),
    date: 0,
    megagroup: true,
  });
  const forum = new Api.Channel({
    id: bigInt(456),
    title: "Test Forum",
    username: "fixture_forum",
    photo: emptyPhoto(),
    date: 0,
    megagroup: true,
    forum: true,
  });
  assert.deepEqual(describeTelegramChat(group), {
    title: "Test Group",
    username: null,
    chatId: "-123",
    type: "group",
    forum: false,
  });
  assert.deepEqual(describeTelegramChat(broadcast), {
    title: "Broadcast Channel",
    username: "fixture_channel",
    chatId: "-100234",
    type: "channel",
    forum: false,
  });
  assert.deepEqual(describeTelegramChat(supergroup), {
    title: "Test Supergroup",
    username: null,
    chatId: "-100345",
    type: "supergroup",
    forum: false,
  });
  assert.deepEqual(describeTelegramChat(forum), {
    title: "Test Forum",
    username: "fixture_forum",
    chatId: "-100456",
    type: "supergroup",
    forum: true,
  });
  assert.equal(describeTelegramChat(new Api.UserEmpty({ id: bigInt(789) })), null);
  assert.equal(maskTelegramAccountId("123456789"), "••••6789");
});

test("chat discovery exhausts main and archived iterators, excludes users, and deduplicates", async () => {
  const group = new Api.Chat({
    id: bigInt(123),
    title: "Main Group",
    photo: emptyPhoto(),
    participantsCount: 2,
    date: 0,
    version: 1,
  });
  const archivedForum = new Api.Channel({
    id: bigInt(456),
    title: "Archived Forum",
    photo: emptyPhoto(),
    date: 0,
    megagroup: true,
    forum: true,
  });
  const visitedFolders: number[] = [];

  const chats = await collectDiscoverableTelegramChats(async function* (folder) {
    visitedFolders.push(folder);
    if (folder === 0) {
      yield { entity: new Api.UserEmpty({ id: bigInt(789) }) };
      yield { entity: group };
      return;
    }
    yield { entity: group };
    yield { entity: archivedForum };
  });

  assert.deepEqual(visitedFolders, [0, 1]);
  assert.deepEqual(chats.map((chat) => chat.title), ["Archived Forum", "Main Group"]);
});
