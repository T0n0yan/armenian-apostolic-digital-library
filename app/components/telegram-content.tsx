import { BarChart3, ExternalLink, MapPin, TriangleAlert } from "lucide-react";
import { createContext, Fragment, useContext, useState, type ReactNode } from "react";

import type {
  BridgeFormattedText,
  BridgeLocation,
  BridgePoll,
  BridgeRichBlock,
  BridgeRichContent,
  BridgeRichInline,
  BridgeSearchHit,
  BridgeTextEntity,
} from "../../shared/telegram-bridge-contract";
import type { MaterialMedia } from "../data/material-detail.server";
import { MaterialMediaItem } from "./material-media";
import { isPsalmLabel, richContentStartsWithTitle } from "../utils/material-title";
import { richInlineText } from "../utils/text";

function safeHref(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function entityWrapper(entity: BridgeTextEntity, child: ReactNode, key: string) {
  switch (entity.type) {
    case "bold": return <strong key={key}>{child}</strong>;
    case "italic": return <em key={key}>{child}</em>;
    case "underline": return <u key={key}>{child}</u>;
    case "strikethrough": return <s key={key}>{child}</s>;
    case "spoiler": return <span className="rounded bg-ink/15 px-0.5 blur-[3px] transition-[filter] hover:blur-none focus-within:blur-none" key={key}>{child}</span>;
    case "code": return <code className="rounded bg-subtle px-1 py-0.5 font-mono text-[0.92em]" key={key}>{child}</code>;
    case "pre": return <code className="font-mono text-[0.92em]" key={key}>{child}</code>;
    // Inline quotes: a left bar breaks apart when a quote wraps, so they are set in a softer tone.
    case "blockquote":
    case "expandable-blockquote": return <span className="text-muted" key={key}>{child}</span>;
    case "link": { const href = safeHref(entity.url); return href ? <a className="font-semibold text-gold-bright underline decoration-gold/35 underline-offset-3" href={href} target="_blank" rel="noreferrer" key={key}>{child}</a> : child; }
    case "mention":
    case "hashtag":
    case "cashtag":
    case "bot-command": return <span className="font-semibold text-gold-bright" key={key}>{child}</span>;
    case "custom-emoji": return <span aria-label="Telegram custom emoji" key={key}>{child}</span>;
  }
}

/** True on pages with a playable video/audio: "01:21"-style times in the text then seek the player. */
export const TimestampSeekContext = createContext(false);

const timestampPattern = /(?<![\d:])(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)(?![\d:])/gu;

export function seekMediaTo(seconds: number) {
  window.dispatchEvent(new CustomEvent("library:seek", { detail: { seconds } }));
}

/**
 * Telegram posts separate paragraphs with a blank line; at reading line-height that is a large gap.
 * A blank line becomes one line break plus a small spacer (offsets are untouched).
 */
function ParagraphText({ text }: { text: string }) {
  if (!/\n[ \t]*\n/u.test(text)) return text;
  const parts = text.split(/\n[ \t]*\n(?:[ \t]*\n)*/u);
  return <>{parts.map((part, index) => <Fragment key={index}>{index > 0 ? <>{"\n"}<span className="block h-[0.55em]" aria-hidden="true" /></> : null}{part}</Fragment>)}</>;
}

function TimestampText({ text }: { text: string }) {
  const enabled = useContext(TimestampSeekContext);
  if (!enabled || !/\d:\d\d/u.test(text)) return <ParagraphText text={text} />;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(timestampPattern)) {
    const index = match.index ?? 0;
    const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    if (index > last) parts.push(<ParagraphText key={`t-${last}`} text={text.slice(last, index)} />);
    parts.push(
      <button
        key={`${index}-${match[0]}`}
        className="mr-1 inline-block min-w-[3.4em] cursor-pointer rounded-[7px] border border-[rgb(217_181_111/35%)] bg-[rgb(217_181_111/12%)] px-1.5 py-0 text-center text-[0.92em] leading-[1.5] font-bold text-gold-bright tabular-nums hover:bg-[rgb(217_181_111/24%)]"
        type="button"
        onClick={() => seekMediaTo(seconds)}
        aria-label={`Դիտել ${match[0]}-ից`}
      >
        {match[0]}
      </button>,
    );
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(<ParagraphText key={`t-${last}`} text={text.slice(last)} />);
  return <>{parts}</>;
}


/** Index of the first letter in `text` at or after `from`, skipping spaces, zero-width marks and quotes. */
function firstLetterIndex(text: string, from = 0) {
  for (let index = from; index < text.length; index += 1) {
    if (/\p{L}/u.test(text[index])) return index;
  }
  return -1;
}

/** Manuscript-style bird-letter initial (Թռչնագիր) dropped into the first lines of a prayer. */
function OrnateInitial({ letter }: { letter: string }) {
  return <span className="ornate-initial">{letter}</span>;
}

function HitText({ text, start, hit }: { text: string; start: number; hit?: BridgeSearchHit }) {
  if (!hit || hit.length <= 0 || start >= hit.start + hit.length || start + text.length <= hit.start) return <TimestampText text={text} />;
  const localStart = Math.max(0, hit.start - start);
  const localEnd = Math.min(text.length, hit.start + hit.length - start);
  return <>{text.slice(0, localStart)}<mark className="rounded-[4px] bg-[rgb(240_196_88/42%)] px-[2px] text-inherit" data-search-hit>{text.slice(localStart, localEnd)}</mark>{text.slice(localEnd)}</>;
}

function RichInlineNodes({ nodes, hit, cursor = { value: 0 }, ornate }: { nodes: BridgeRichInline[]; hit?: BridgeSearchHit; cursor?: { value: number }; ornate?: { done: boolean } }) {
  return nodes.map((node, index): ReactNode => {
    const key = `${node.type}-${index}`;
    if (node.type === "text") {
      const start = cursor.value;
      cursor.value += node.text.length;
      const letter = ornate && !ornate.done ? firstLetterIndex(node.text) : -1;
      if (ornate && letter >= 0) {
        ornate.done = true;
        return <Fragment key={key}><HitText text={node.text.slice(0, letter)} start={start} hit={hit} /><OrnateInitial letter={node.text[letter]} /><HitText text={node.text.slice(letter + 1)} start={start + letter + 1} hit={hit} /></Fragment>;
      }
      return <Fragment key={key}><HitText text={node.text} start={start} hit={hit} /></Fragment>;
    }
    if (node.type === "line-break") { cursor.value += 1; return <br key={key} />; }
    if (node.type === "custom-emoji") { const alt = node.alt || "◻"; const start = cursor.value; cursor.value += alt.length; return <span aria-label="Telegram custom emoji" title="Telegram custom emoji" key={key}><HitText text={alt} start={start} hit={hit} /></span>; }
    if (node.type === "unsupported") return <span className="sr-only" key={key}>Չաջակցվող ձևաչափ</span>;
    const child = <RichInlineNodes nodes={node.children} hit={hit} cursor={cursor} ornate={ornate} />;
    if (node.type === "bold") return <strong key={key}>{child}</strong>;
    if (node.type === "italic") return <em key={key}>{child}</em>;
    if (node.type === "underline") return <u key={key}>{child}</u>;
    if (node.type === "strikethrough") return <s key={key}>{child}</s>;
    if (node.type === "spoiler") return <span className="rounded bg-ink/15 px-0.5 blur-[3px] transition-[filter] hover:blur-none focus-within:blur-none" key={key}>{child}</span>;
    if (node.type === "code") return <code className="rounded bg-subtle px-1 py-0.5 font-mono text-[0.92em]" key={key}>{child}</code>;
    if (node.type === "subscript") return <sub key={key}>{child}</sub>;
    if (node.type === "superscript") return <sup key={key}>{child}</sup>;
    if (node.type === "mark") return <mark className="bg-gold/20 text-inherit" key={key}>{child}</mark>;
    if (node.type === "link") {
      const href = safeHref(node.url);
      return href ? <a className="font-semibold text-gold-bright underline decoration-gold/35 underline-offset-3" href={href} target="_blank" rel="noreferrer" key={key}>{child}</a> : <Fragment key={key}>{child}</Fragment>;
    }
    return <Fragment key={key}>{child}</Fragment>;
  });
}

function RichBlocks({ blocks, media, hit, prefix = "block", skipFirst = false, ornate }: { blocks: BridgeRichBlock[]; media: MaterialMedia[]; hit?: BridgeSearchHit; prefix?: string; skipFirst?: boolean; ornate?: { done: boolean } }) {
  return blocks.map((block, index) => {
    // Skip by rendering nothing so block IDs, which search hits point at, keep their indexes.
    if (skipFirst && index === 0) return null;
    // "(Սաղմոս 3)" only repeats the number shown above the player.
    if (block.type === "paragraph" && index < 4 && isPsalmLabel(richInlineText(block.content))) return null;
    const key = `${block.type}-${index}`;
    const blockId = `${prefix}-${index}`;
    const blockHit = hit?.blockId === blockId ? hit : undefined;
    const targetId = `telegram-${blockId}`;
    if (block.type === "heading") {
      const className = block.level <= 2 ? "m-0 font-serif text-[clamp(1.25rem,4vw,1.8rem)] leading-tight text-ink" : "m-0 font-serif text-[clamp(1.05rem,3vw,1.35rem)] leading-snug text-ink";
      const content = <RichInlineNodes nodes={block.content} hit={blockHit} />;
      if (block.level === 1) return <h2 className={className} id={targetId} tabIndex={blockHit ? -1 : undefined} key={key}>{content}</h2>;
      if (block.level === 2) return <h3 className={className} id={targetId} tabIndex={blockHit ? -1 : undefined} key={key}>{content}</h3>;
      return <h4 className={className} id={targetId} tabIndex={blockHit ? -1 : undefined} key={key}>{content}</h4>;
    }
    if (block.type === "paragraph") return <p className="m-0 whitespace-pre-wrap break-words" id={targetId} tabIndex={blockHit ? -1 : undefined} key={key}><RichInlineNodes nodes={block.content} hit={blockHit} ornate={ornate} /></p>;
    if (block.type === "pre") return <pre className="m-0 overflow-x-auto rounded-[14px] border border-glass-border bg-subtle p-4 text-[0.86em] leading-relaxed" id={targetId} tabIndex={blockHit ? -1 : undefined} key={key}><code data-language={block.language ?? undefined}><RichInlineNodes nodes={block.content} hit={blockHit} /></code></pre>;
    if (block.type === "divider") return <hr className="my-1 w-full border-0 border-t border-gold/25" key={key} />;
    if (block.type === "media") {
      const asset = media[block.mediaIndex];
      const captionId = `${blockId}-caption`;
      const captionHit = hit?.blockId === captionId ? hit : undefined;
      return asset ? <figure className="m-0 grid gap-2" key={key}><MaterialMediaItem asset={asset} />{block.caption.length ? <figcaption className="text-[13px] leading-relaxed text-muted" id={`telegram-${captionId}`} tabIndex={captionHit ? -1 : undefined}><RichInlineNodes nodes={block.caption} hit={captionHit} /></figcaption> : null}</figure> : <p className="m-0 rounded-[12px] border border-dashed border-glass-border p-3 text-[12px] text-muted" key={key}>Մեդիան առայժմ հասանելի չէ։</p>;
    }
    if (block.type === "list") {
      const List = block.ordered ? "ol" : "ul";
      return <List className={`m-0 grid gap-1.5 pl-6 marker:text-gold ${block.ordered ? "list-decimal" : "list-disc"}`} start={block.ordered ? block.start ?? undefined : undefined} key={key}>{block.items.map((item, itemIndex) => <li className="pl-1" key={`${key}-${itemIndex}`}><div className="grid gap-2"><RichBlocks blocks={item} media={media} hit={hit} prefix={`${blockId}-${itemIndex}`} /></div></li>)}</List>;
    }
    if (block.type === "blockquote") {
      const captionId = `${blockId}-caption`;
      const captionHit = hit?.blockId === captionId ? hit : undefined;
      const body = <><div className="grid gap-2"><RichBlocks blocks={block.blocks} media={media} hit={hit} prefix={blockId} /></div>{block.caption.length ? <footer className="mt-2 text-[12px] text-faint" id={`telegram-${captionId}`} tabIndex={captionHit ? -1 : undefined}><RichInlineNodes nodes={block.caption} hit={captionHit} /></footer> : null}</>;
      return block.expandable ? <details className="rounded-r-[14px] border-l-2 border-gold/45 bg-subtle px-4 py-3 text-muted" key={key}><summary className="cursor-pointer font-semibold text-ink">Բացել մեջբերումը</summary><div className="mt-3">{body}</div></details> : <blockquote className="m-0 rounded-r-[14px] border-l-2 border-gold/45 bg-subtle px-4 py-3 text-muted" key={key}>{body}</blockquote>;
    }
    return <p className="m-0 rounded-[12px] border border-dashed border-glass-border p-3 text-[11px] text-muted" key={key}>Այս հատվածի ձևաչափը դեռ ամբողջությամբ չի աջակցվում։</p>;
  });
}

export function TelegramRichMessage({ value, media, hit, title, ornateInitial = false }: { value: BridgeRichContent; media: MaterialMedia[]; hit?: BridgeSearchHit; title?: string; ornateInitial?: boolean }) {
  const skipFirst = title ? richContentStartsWithTitle(value, title) : false;
  // A fresh marker per render: only the first paragraph's first letter becomes the initial.
  const ornate = ornateInitial ? { done: false } : undefined;
  return <section className="grid gap-4 frosted-panel px-4 py-5 text-[length:var(--reading-size)] leading-[1.85] text-ink shadow-card min-[560px]:gap-5 min-[560px]:px-7 min-[560px]:py-7" aria-label="Telegram ձևաչափված նյութ"><RichBlocks blocks={value.blocks} media={media} hit={hit} skipFirst={skipFirst} ornate={ornate} />{value.partial ? <p className="m-0 rounded-[12px] border border-glass-border bg-subtle p-3 text-[11px] text-muted">Telegram-ը փոխանցել է նյութի մասնակի տարբերակը։</p> : null}</section>;
}

export function FormattedTelegramText({ value, hit, from = 0, to, ornateInitial = false }: { value: BridgeFormattedText; hit?: BridgeSearchHit; from?: number; to?: number; ornateInitial?: boolean }) {
  const end = Math.min(to ?? value.text.length, value.text.length);
  if (!value.text || from >= end) return null;
  const initial = ornateInitial ? firstLetterIndex(value.text, from) : -1;
  const entities = value.entities.filter((entity) =>
    entity.offset >= 0 && entity.length > 0 && entity.offset + entity.length <= value.text.length,
  );
  // Offsets stay absolute so entities and search hits still line up when a leading title is skipped.
  const boundaries = [...new Set([from, end, ...(initial >= 0 ? [initial, initial + 1] : []), ...entities.flatMap((entity) => [entity.offset, entity.offset + entity.length])])]
    .filter((boundary) => boundary >= from && boundary <= end)
    .sort((left, right) => left - right);

  return (
    <span className="whitespace-pre-wrap break-words">
      {boundaries.slice(0, -1).map((start, index) => {
        const end = boundaries[index + 1];
        let node: ReactNode = start === initial
          ? <OrnateInitial letter={value.text.slice(start, end)} />
          : <HitText text={value.text.slice(start, end)} start={start} hit={hit} />;
        const active = entities.filter((entity) => entity.offset <= start && entity.offset + entity.length >= end);
        for (const [entityIndex, entity] of active.entries()) {
          node = entityWrapper(entity, node, `${start}-${end}-${entityIndex}`);
        }
        return <Fragment key={`${start}-${end}`}>{node}</Fragment>;
      })}
    </span>
  );
}

type PollVotes = { counts: number[]; mine: number | null };

/**
 * A Telegram quiz or poll the reader answers for themselves (library votes can't be added to
 * Telegram's count, so no numbers are shown). After answering, a quiz turns the reader's choice
 * red if it was wrong, marks the right answer green and opens the explanation below.
 */
export function TelegramPollCard({ poll, title, materialId, votes, canVote = false }: {
  poll: BridgePoll; telegramUrl?: string; title?: string; materialId?: string; votes?: PollVotes | null; canVote?: boolean;
}) {
  const [mine, setMine] = useState<number | null>(votes?.mine ?? null);
  const [sending, setSending] = useState(false);
  const answered = mine !== null;
  const canAnswer = canVote && Boolean(materialId) && !answered && !poll.closed;
  const correctIndex = poll.quiz ? poll.options.findIndex((option) => option.correct) : -1;
  // The page title is usually the question itself; don't print it twice.
  const repeatsTitle = Boolean(title) && poll.question.text.trim() === title?.trim();

  const vote = async (index: number) => {
    if (!canAnswer || sending) return;
    setSending(true);
    setMine(index);
    await fetch("/api/poll-vote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ materialId, option: index }) }).catch(() => null);
    setSending(false);
  };

  return (
    <section className="grid gap-4 frosted-panel p-5 shadow-card" aria-label={poll.quiz ? "Վիկտորինա" : "Հարցում"}>
      <header className="flex items-start gap-3">
        <BarChart3 className="mt-0.5 shrink-0 text-gold" aria-hidden="true" size={21} />
        <div className="grid gap-1">
          {repeatsTitle ? <h2 className="m-0 text-[13px] font-semibold tracking-[0.3px] text-gold-bright">{poll.quiz ? "Վիկտորինա" : "Հարցում"}</h2> : <h2 className="m-0 text-[16px] leading-[1.5] text-ink"><FormattedTelegramText value={poll.question} /></h2>}
          <p className="m-0 text-[11.5px] text-faint">
            {canAnswer ? "Ընտրեք պատասխանը" : answered ? (correctIndex < 0 ? "Ձեր պատասխանը պահված է" : mine === correctIndex ? "Ճիշտ է, ապրեք 🙏" : "Սխալ է. ճիշտ պատասխանը նշված է կանաչով") : poll.closed ? "Հարցումը փակված է" : "Պատասխանելու համար մուտք գործեք"}
          </p>
        </div>
      </header>
      <ol className="m-0 grid list-none gap-2.5 p-0">
        {poll.options.map((option, index) => {
          const chosen = mine === index;
          const right = answered && index === correctIndex;
          const wrong = answered && chosen && correctIndex >= 0 && index !== correctIndex;
          const tone = right ? "border-[rgb(74_160_96/60%)] bg-[rgb(74_160_96/14%)]" : wrong ? "border-[rgb(205_70_55/60%)] bg-[rgb(205_70_55/12%)]" : chosen ? "border-[rgb(217_181_111/60%)] bg-[rgb(217_181_111/14%)]" : "border-glass-border bg-subtle";
          const content = (
            <span className="flex items-center justify-between gap-3 text-[14px] leading-snug text-ink">
              <span><FormattedTelegramText value={option.text} /></span>
              {right ? <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[rgb(74_160_96)] text-[13px] font-bold text-white" aria-label="Ճիշտ պատասխան">✓</span> : wrong ? <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[rgb(205_70_55)] text-[13px] font-bold text-white" aria-label="Սխալ պատասխան">✕</span> : null}
            </span>
          );
          return (
            <li key={`${index}-${option.text.text}`}>
              {canAnswer ? (
                <button className={`w-full cursor-pointer rounded-[13px] border p-3.5 text-left transition-[background,transform,border-color] duration-200 hover:bg-[rgb(217_181_111/12%)] active:scale-[.99] ${tone}`} type="button" disabled={sending} onClick={() => vote(index)}>{content}</button>
              ) : (
                <div className={`rounded-[13px] border p-3.5 transition-[background,border-color] duration-500 ${tone}`}>{content}</div>
              )}
            </li>
          );
        })}
      </ol>
      {/* The explanation opens smoothly once the reader has answered. */}
      {poll.quiz && poll.solution ? (
        <div className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${answered ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`} aria-hidden={!answered}>
          <div className="overflow-hidden">
            <p className="m-0 rounded-[13px] border border-[rgb(217_181_111/30%)] bg-[rgb(217_181_111/8%)] px-4 py-3 text-[13.5px] leading-[1.65] text-ink whitespace-pre-line"><strong className="mb-1 block text-[11.5px] tracking-[0.4px] text-gold uppercase">Բացատրություն</strong>{poll.solution}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function TelegramLocationCard({ location }: { location: BridgeLocation }) {
  const mapUrl = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(location.latitude)}&mlon=${encodeURIComponent(location.longitude)}#map=16/${encodeURIComponent(location.latitude)}/${encodeURIComponent(location.longitude)}`;
  return (
    <section className="grid gap-3 frosted-panel p-5 shadow-card" aria-label="Telegram տեղադրություն">
      <header className="flex items-start gap-3"><MapPin className="mt-0.5 shrink-0 text-gold" aria-hidden="true" size={22} /><div><h2 className="m-0 text-[16px] leading-[1.5] text-ink">{location.title || "Տեղադրություն"}</h2>{location.address ? <p className="mt-1 mb-0 text-[13px] leading-[1.55] text-muted">{location.address}</p> : null}</div></header>
      <p className="m-0 font-mono text-[11px] text-faint">{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}{location.live ? " · live location" : ""}</p>
      <a className="inline-flex min-h-11 w-fit items-center gap-2 rounded-[13px] border border-glass-border bg-subtle px-4 text-[12px] font-bold text-gold-bright no-underline" href={mapUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" size={16} /> Բացել քարտեզում</a>
    </section>
  );
}

export function TelegramUnsupportedCard({ telegramUrl }: { type: string | null; telegramUrl: string }) {
  return (
    <section className="grid gap-3 rounded-[18px] border border-dashed border-[rgb(217_181_111/28%)] bg-subtle p-5 text-muted" aria-label="Չաջակցվող Telegram նյութ">
      <span className="flex items-center gap-2 text-[13px] font-bold text-ink"><TriangleAlert className="text-gold" aria-hidden="true" size={19} /> Այս նյութի տեսակը դեռ չի ցուցադրվում հավելվածում</span>
      <span className="text-[11px]">Telegram-ում հասանելի հավելված կամ ձևաչափ</span>
      <a className="inline-flex min-h-11 w-fit items-center gap-2 rounded-[13px] border border-glass-border bg-glass px-4 text-[12px] font-bold text-gold-bright no-underline" href={telegramUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" size={16} /> Բացել Telegram-ում</a>
    </section>
  );
}
