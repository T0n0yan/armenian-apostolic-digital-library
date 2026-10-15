import assert from "node:assert/strict";
import test from "node:test";

import bigInt from "big-integer";
import { Api } from "telegram";

import { describeTelegramChat, maskTelegramAccountId } from "../services/telegram-bridge/src/chat-discovery";

const emptyPhoto = () => new Api.ChatPhotoEmpty();

test("chat discovery exposes only safe group/channel metadata and filters private users", () => {
  const group = new Api.Chat({
    id: bigInt(123),
    title: "Test\nGroup",
    photo: emptyPhoto(),
    participantsCount: 2,
    date: 0,
    version: 1,
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
