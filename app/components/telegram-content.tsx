import { BarChart3, ExternalLink, MapPin, TriangleAlert } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import type {
  BridgeFormattedText,
  BridgeLocation,
  BridgePoll,
  BridgeRichBlock,
  BridgeRichContent,
  BridgeRichInline,
  BridgeTextEntity,
} from "../../shared/telegram-bridge-contract";
import type { MaterialMedia } from "../data/material-detail.server";
import { MaterialMediaItem } from "./material-media";

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
    case "blockquote": return <span className="border-l-2 border-gold/45 pl-3 text-muted" key={key}>{child}</span>;
    case "expandable-blockquote": return <span className="border-l-2 border-gold/45 pl-3 text-muted" key={key}>{child}</span>;
    case "link": { const href = safeHref(entity.url); return href ? <a className="font-semibold text-gold-bright underline decoration-gold/35 underline-offset-3" href={href} target="_blank" rel="noreferrer" key={key}>{child}</a> : child; }
    case "mention":
    case "hashtag":
    case "cashtag":
    case "bot-command": return <span className="font-semibold text-gold-bright" key={key}>{child}</span>;
    case "custom-emoji": return <span aria-label="Telegram custom emoji" key={key}>{child}</span>;
  }
}

function RichInlineNodes({ nodes }: { nodes: BridgeRichInline[] }) {
  return nodes.map((node, index): ReactNode => {
    const key = `${node.type}-${index}`;
    if (node.type === "text") return <Fragment key={key}>{node.text}</Fragment>;
    if (node.type === "line-break") return <br key={key} />;
    if (node.type === "custom-emoji") return <span aria-label="Telegram custom emoji" title="Telegram custom emoji" key={key}>{node.alt || "◻"}</span>;
    if (node.type === "unsupported") return <span className="sr-only" key={key}>Չաջակցվող ձևաչափ</span>;
    const child = <RichInlineNodes nodes={node.children} />;
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

function RichBlocks({ blocks, media }: { blocks: BridgeRichBlock[]; media: MaterialMedia[] }) {
  return blocks.map((block, index) => {
    const key = `${block.type}-${index}`;
    if (block.type === "heading") {
      const className = block.level <= 2 ? "m-0 font-serif text-[clamp(1.25rem,4vw,1.8rem)] leading-tight text-ink" : "m-0 font-serif text-[clamp(1.05rem,3vw,1.35rem)] leading-snug text-ink";
      const content = <RichInlineNodes nodes={block.content} />;
      if (block.level === 1) return <h2 className={className} key={key}>{content}</h2>;
      if (block.level === 2) return <h3 className={className} key={key}>{content}</h3>;
      return <h4 className={className} key={key}>{content}</h4>;
    }
    if (block.type === "paragraph") return <p className="m-0 whitespace-pre-wrap break-words" key={key}><RichInlineNodes nodes={block.content} /></p>;
    if (block.type === "pre") return <pre className="m-0 overflow-x-auto rounded-[14px] border border-glass-border bg-subtle p-4 text-[0.86em] leading-relaxed" key={key}><code data-language={block.language ?? undefined}><RichInlineNodes nodes={block.content} /></code></pre>;
    if (block.type === "divider") return <hr className="my-1 w-full border-0 border-t border-gold/25" key={key} />;
    if (block.type === "media") {
      const asset = media[block.mediaIndex];
      return asset ? <figure className="m-0 grid gap-2" key={key}><MaterialMediaItem asset={asset} />{block.caption.length ? <figcaption className="text-[13px] leading-relaxed text-muted"><RichInlineNodes nodes={block.caption} /></figcaption> : null}</figure> : <p className="m-0 rounded-[12px] border border-dashed border-glass-border p-3 text-[12px] text-muted" key={key}>Մեդիան առայժմ հասանելի չէ։</p>;
    }
    if (block.type === "list") {
      const List = block.ordered ? "ol" : "ul";
      return <List className="m-0 grid gap-2 pl-6" start={block.ordered ? block.start ?? undefined : undefined} key={key}>{block.items.map((item, itemIndex) => <li className="pl-1" key={`${key}-${itemIndex}`}><div className="grid gap-2"><RichBlocks blocks={item} media={media} /></div></li>)}</List>;
    }
    if (block.type === "blockquote") {
      const body = <><div className="grid gap-2"><RichBlocks blocks={block.blocks} media={media} /></div>{block.caption.length ? <footer className="mt-2 text-[12px] text-faint"><RichInlineNodes nodes={block.caption} /></footer> : null}</>;
      return block.expandable ? <details className="rounded-r-[14px] border-l-2 border-gold/45 bg-subtle px-4 py-3 text-muted" key={key}><summary className="cursor-pointer font-semibold text-ink">Բացել մեջբերումը</summary><div className="mt-3">{body}</div></details> : <blockquote className="m-0 rounded-r-[14px] border-l-2 border-gold/45 bg-subtle px-4 py-3 text-muted" key={key}>{body}</blockquote>;
    }
    return <p className="m-0 rounded-[12px] border border-dashed border-glass-border p-3 text-[11px] text-muted" key={key}>Այս հատվածի ձևաչափը դեռ ամբողջությամբ չի աջակցվում։</p>;
  });
}

export function TelegramRichMessage({ value, media }: { value: BridgeRichContent; media: MaterialMedia[] }) {
  return <section className="grid gap-4 rounded-[20px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] px-4 py-5 text-[15px] leading-[1.85] text-ink shadow-card min-[560px]:gap-5 min-[560px]:px-7 min-[560px]:py-7 min-[560px]:text-[16px]" aria-label="Telegram ձևաչափված նյութ"><RichBlocks blocks={value.blocks} media={media} />{value.partial ? <p className="m-0 rounded-[12px] border border-glass-border bg-subtle p-3 text-[11px] text-muted">Telegram-ը փոխանցել է նյութի մասնակի տարբերակը։</p> : null}</section>;
}

export function FormattedTelegramText({ value }: { value: BridgeFormattedText }) {
  if (!value.text) return null;
  const entities = value.entities.filter((entity) =>
    entity.offset >= 0 && entity.length > 0 && entity.offset + entity.length <= value.text.length,
  );
  const boundaries = [...new Set([0, value.text.length, ...entities.flatMap((entity) => [entity.offset, entity.offset + entity.length])])]
    .sort((left, right) => left - right);

  return (
    <span className="whitespace-pre-wrap break-words">
      {boundaries.slice(0, -1).map((start, index) => {
        const end = boundaries[index + 1];
        let node: ReactNode = value.text.slice(start, end);
        const active = entities.filter((entity) => entity.offset <= start && entity.offset + entity.length >= end);
        for (const [entityIndex, entity] of active.entries()) {
          node = entityWrapper(entity, node, `${start}-${end}-${entityIndex}`);
        }
        return <Fragment key={`${start}-${end}`}>{node}</Fragment>;
      })}
    </span>
  );
}

export function TelegramPollCard({ poll, telegramUrl }: { poll: BridgePoll; telegramUrl: string }) {
  return (
    <section className="grid gap-4 rounded-[20px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] p-5 shadow-card" aria-label="Telegram հարցում">
      <header className="flex items-start gap-3">
        <BarChart3 className="mt-0.5 shrink-0 text-gold" aria-hidden="true" size={21} />
        <div className="grid gap-1">
          <h2 className="m-0 text-[16px] leading-[1.5] text-ink"><FormattedTelegramText value={poll.question} /></h2>
          <p className="m-0 text-[11px] text-faint">{poll.totalVoters} քվե · {poll.anonymous ? "անանուն" : "հրապարակային"}{poll.closed ? " · փակված" : ""}</p>
        </div>
      </header>
      <ol className="m-0 grid list-none gap-3 p-0">
        {poll.options.map((option, index) => {
          const percent = poll.totalVoters > 0 ? Math.round(option.voterCount / poll.totalVoters * 100) : 0;
          return (
            <li className="grid gap-1.5 rounded-[12px] border border-glass-border bg-subtle p-2.5" key={`${index}-${option.text.text}`}>
              <div className="flex items-start justify-between gap-3 text-[13px] text-ink">
                <span className="flex items-start gap-1.5"><FormattedTelegramText value={option.text} /></span>
                <span className="shrink-0 tabular-nums text-muted">{option.voterCount} · {percent}%</span>
              </div>
              <span className="h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true"><span className="block h-full rounded-full bg-gold/65" style={{ width: `${percent}%` }} /></span>
            </li>
          );
        })}
      </ol>
      <a className="inline-flex min-h-11 w-fit items-center gap-2 rounded-[13px] border border-[rgb(217_181_111/25%)] bg-[rgb(217_181_111/9%)] px-4 text-[12px] font-bold text-gold-bright no-underline" href={telegramUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" size={16} /> {poll.closed ? "Բացել Telegram-ում" : "Քվեարկել Telegram-ում"}</a>
    </section>
  );
}

export function TelegramLocationCard({ location }: { location: BridgeLocation }) {
  const mapUrl = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(location.latitude)}&mlon=${encodeURIComponent(location.longitude)}#map=16/${encodeURIComponent(location.latitude)}/${encodeURIComponent(location.longitude)}`;
  return (
    <section className="grid gap-3 rounded-[20px] border border-glass-border bg-[linear-gradient(145deg,var(--glass-highlight),transparent_46%),var(--glass)] p-5 shadow-card" aria-label="Telegram տեղադրություն">
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
