import { BarChart3, ExternalLink, MapPin, TriangleAlert } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import type {
  BridgeFormattedText,
  BridgeLocation,
  BridgePoll,
  BridgeTextEntity,
} from "../../shared/telegram-bridge-contract";

function entityWrapper(entity: BridgeTextEntity, child: ReactNode, key: string) {
  switch (entity.type) {
    case "bold": return <strong key={key}>{child}</strong>;
    case "italic": return <em key={key}>{child}</em>;
    case "underline": return <u key={key}>{child}</u>;
    case "strikethrough": return <s key={key}>{child}</s>;
    case "code": return <code className="rounded bg-subtle px-1 py-0.5 font-mono text-[0.92em]" key={key}>{child}</code>;
    case "pre": return <code className="font-mono text-[0.92em]" key={key}>{child}</code>;
    case "blockquote": return <span className="border-l-2 border-gold/45 pl-3 text-muted" key={key}>{child}</span>;
    case "link": return entity.url ? <a className="font-semibold text-gold-bright underline decoration-gold/35 underline-offset-3" href={entity.url} target="_blank" rel="noreferrer" key={key}>{child}</a> : child;
  }
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

export function TelegramUnsupportedCard({ type, telegramUrl }: { type: string | null; telegramUrl: string }) {
  return (
    <section className="grid gap-3 rounded-[18px] border border-dashed border-[rgb(217_181_111/28%)] bg-subtle p-5 text-muted" aria-label="Չաջակցվող Telegram նյութ">
      <span className="flex items-center gap-2 text-[13px] font-bold text-ink"><TriangleAlert className="text-gold" aria-hidden="true" size={19} /> Այս նյութի տեսակը դեռ չի ցուցադրվում հավելվածում</span>
      <span className="text-[11px]">Տեսակ՝ {type || "անհայտ"}</span>
      <a className="inline-flex min-h-11 w-fit items-center gap-2 rounded-[13px] border border-glass-border bg-glass px-4 text-[12px] font-bold text-gold-bright no-underline" href={telegramUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" size={16} /> Բացել Telegram-ում</a>
    </section>
  );
}
