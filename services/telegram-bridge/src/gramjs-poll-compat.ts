import { Api, TelegramClient } from "telegram";
import { tlobjects } from "telegram/tl/AllTLObjects.js";

type Reader = {
  readInt(signed?: boolean): number;
  readLong(): { toString(): string };
  tgReadObject(): unknown;
  tgReadVector(): unknown[];
  tgReadBytes(): Buffer;
  tgReadString(): string;
};

export type GramJsPollSnapshot = {
  id: string;
  question: Api.TypeTextWithEntities;
  answers: Array<{ text: Api.TypeTextWithEntities; option: Buffer }>;
  results: Array<{ option: Buffer; voters: number; chosen: boolean; correct: boolean }>;
  totalVoters: number;
  closed: boolean;
  publicVoters: boolean;
  multipleChoice: boolean;
  quiz: boolean;
  solution: string | null;
  solutionEntities: Api.TypeMessageEntity[];
};

class CurrentPollAnswerVoters {
  static readonly CONSTRUCTOR_ID = 0x3645230a;
  readonly className = "PollAnswerVoters";

  constructor(
    readonly chosen: boolean,
    readonly correct: boolean,
    readonly option: Buffer,
    readonly voters: number,
  ) {}

  static fromReader(reader: Reader) {
    const flags = reader.readInt();
    const option = reader.tgReadBytes();
    const voters = flags & 4 ? reader.readInt() : 0;
    if (flags & 4) reader.tgReadVector();
    return new CurrentPollAnswerVoters(Boolean(flags & 1), Boolean(flags & 2), option, voters);
  }
}

class CurrentPollResults {
  static readonly CONSTRUCTOR_ID = 0xba7bb15e;
  readonly className = "PollResults";

  constructor(
    readonly results: CurrentPollAnswerVoters[],
    readonly totalVoters: number,
    readonly solution: string | null,
    readonly solutionEntities: Api.TypeMessageEntity[],
  ) {}

  static fromReader(reader: Reader) {
    const flags = reader.readInt();
    const results = flags & 2 ? reader.tgReadVector() as CurrentPollAnswerVoters[] : [];
    const totalVoters = flags & 4 ? reader.readInt() : 0;
    if (flags & 8) reader.tgReadVector();
    const solution = flags & 16 ? reader.tgReadString() : null;
    const solutionEntities = flags & 16 ? reader.tgReadVector() as Api.TypeMessageEntity[] : [];
    if (flags & 32) reader.tgReadObject();
    return new CurrentPollResults(results, totalVoters, solution, solutionEntities);
  }
}

class CurrentPollAnswer {
  static readonly CONSTRUCTOR_ID = 0x4b7d786a;
  readonly className = "PollAnswer";

  constructor(
    readonly text: Api.TypeTextWithEntities,
    readonly option: Buffer,
  ) {}

  static fromReader(reader: Reader) {
    const flags = reader.readInt();
    const text = reader.tgReadObject() as Api.TypeTextWithEntities;
    const option = reader.tgReadBytes();
    if (flags & 1) reader.tgReadObject();
    if (flags & 2) {
      reader.tgReadObject();
      reader.readInt();
    }
    return new CurrentPollAnswer(text, option);
  }
}

type CurrentPoll = {
  id: { toString(): string };
  closed: boolean;
  publicVoters: boolean;
  multipleChoice: boolean;
  quiz: boolean;
  question: Api.TypeTextWithEntities;
  answers: CurrentPollAnswer[];
};

function readCurrentPoll(reader: Reader, hasCountryRestrictions: boolean): CurrentPoll {
  const id = reader.readLong();
  const flags = reader.readInt();
  const question = reader.tgReadObject() as Api.TypeTextWithEntities;
  const answers = reader.tgReadVector() as CurrentPollAnswer[];
  if (flags & 16) reader.readInt();
  if (flags & 32) reader.readInt();
  if (hasCountryRestrictions && flags & 4096) {
    reader.readInt();
    const count = reader.readInt();
    for (let index = 0; index < count; index += 1) reader.tgReadString();
  }
  reader.readLong();
  return {
    id,
    closed: Boolean(flags & 1),
    publicVoters: Boolean(flags & 2),
    multipleChoice: Boolean(flags & 4),
    quiz: Boolean(flags & 8),
    question,
    answers,
  };
}

class Layer224Poll {
  static readonly CONSTRUCTOR_ID = 0xb8425be9;
  static fromReader(reader: Reader) { return readCurrentPoll(reader, false); }
}

class Layer225Poll {
  static readonly CONSTRUCTOR_ID = 0x966e2dbf;
  static fromReader(reader: Reader) { return readCurrentPoll(reader, true); }
}

class CurrentUpdateMessagePoll {
  static readonly CONSTRUCTOR_ID = 0xd64c522b;
  readonly className = "UpdateMessagePoll";

  constructor(
    readonly pollId: { toString(): string },
    readonly poll: CurrentPoll | null,
    readonly results: CurrentPollResults,
  ) {}

  static fromReader(reader: Reader) {
    const flags = reader.readInt();
    if (flags & 2) {
      reader.tgReadObject();
      reader.readInt();
    }
    if (flags & 4) reader.readInt();
    const pollId = reader.readLong();
    const poll = flags & 1 ? reader.tgReadObject() as CurrentPoll : null;
    const results = reader.tgReadObject() as CurrentPollResults;
    return new CurrentUpdateMessagePoll(pollId, poll, results);
  }
}

let registered = false;

function registerCurrentPollConstructors() {
  if (registered) return;
  registered = true;
  tlobjects[CurrentPollAnswerVoters.CONSTRUCTOR_ID] = CurrentPollAnswerVoters;
  tlobjects[CurrentPollResults.CONSTRUCTOR_ID] = CurrentPollResults;
  tlobjects[CurrentPollAnswer.CONSTRUCTOR_ID] = CurrentPollAnswer;
  tlobjects[Layer224Poll.CONSTRUCTOR_ID] = Layer224Poll;
  tlobjects[Layer225Poll.CONSTRUCTOR_ID] = Layer225Poll;
  tlobjects[CurrentUpdateMessagePoll.CONSTRUCTOR_ID] = CurrentUpdateMessagePoll;
}

/**
 * GramJS 2.26.x negotiates API layer 198. Telegram represents polls that use
 * newer poll capabilities as MessageMediaUnsupported at that layer. The
 * current read-only getPollResults method, called with hash 0, returns the
 * complete poll definition and current results without casting a vote.
 */
export async function getCurrentPollSnapshot(
  client: TelegramClient,
  peer: string,
  messageId: number,
  signal?: AbortSignal,
): Promise<GramJsPollSnapshot | null> {
  signal?.throwIfAborted();
  registerCurrentPollConstructors();
  try {
    const request = new Api.messages.GetPollResults({ peer, msgId: messageId });
    const mutableRequest = request as unknown as { CONSTRUCTOR_ID: number; getBytes(): Buffer };
    const legacyGetBytes = mutableRequest.getBytes.bind(mutableRequest);
    mutableRequest.CONSTRUCTOR_ID = 0xeda3e33b;
    mutableRequest.getBytes = () => Buffer.concat([legacyGetBytes(), Buffer.alloc(8)]);
    const updates = await client.invoke(request) as unknown as { updates: unknown[] };
    signal?.throwIfAborted();
    const update = updates.updates.find((value) => value instanceof CurrentUpdateMessagePoll);
    if (!update?.poll) return null;
    return {
      id: update.poll.id.toString(),
      question: update.poll.question,
      answers: update.poll.answers,
      results: update.results.results,
      totalVoters: update.results.totalVoters,
      closed: update.poll.closed,
      publicVoters: update.poll.publicVoters,
      multipleChoice: update.poll.multipleChoice,
      quiz: update.poll.quiz,
      solution: update.results.solution,
      solutionEntities: update.results.solutionEntities,
    };
  } catch {
    signal?.throwIfAborted();
    return null;
  }
}
