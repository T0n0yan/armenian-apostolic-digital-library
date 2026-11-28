import { BookOpen, BookText, CalendarDays, Church, CircleHelp, Clock, Compass, Cross, DoorOpen, Shirt, Flame, Flower2, Gift, HandHeart, Home, Leaf, Library, Music, ScrollText, ShieldQuestion, Sparkles, Wine, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { RULE_KINDS, type RuleKind } from "../data/etiquette";

/** Կանոն / Ավանդույթ / Սնահավատություն պիտակը։ */
export function KindBadge({ kind }: { kind: RuleKind }) {
  return <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${RULE_KINDS[kind].className}`}>{RULE_KINDS[kind].label}</span>;
}

/** Ամեն բաժնի պատկերակը (ճանապարհի կանգառները)։ */
export const TOPIC_ICONS: Record<string, LucideIcon> = {
  entrance: DoorOpen,
  appearance: Shirt,
  candles: Flame,
  liturgy: Music,
  holy: Sparkles,
  clergy: HandHeart,
  communion: Wine,
  offering: Gift,
  special: ShieldQuestion,
  home: Home,
};

export function TopicIcon({ slug, size = 22 }: { slug: string; size?: number }) {
  const Icon = TOPIC_ICONS[slug] ?? Sparkles;
  return <Icon aria-hidden="true" size={size} strokeWidth={1.7} />;
}

/** Խմբավորված ցուցակի քարտը և խմբի վերնագիրը (բաց, կոկիկ ոճ)։ */
export const card = "paper-panel rounded-card";
export const groupTitle = "m-0 px-1 text-[12px] font-bold tracking-[1.2px] text-gold uppercase";

/** «Կարգեր և վարքեր»-ի ենթաբաժինների պատկերակները (ուղեցույցի `icon` դաշտը)։ */
export const CHURCH_ICONS: Record<string, LucideIcon> = {
  church: Church, sparkles: Sparkles, flower: Flower2, wine: Wine, clock: Clock, question: CircleHelp, book: BookText, music: Music,
  cross: Cross, leaf: Leaf, calendar: CalendarDays, compass: Compass, scroll: ScrollText, hand: HandHeart, "book-open": BookOpen, library: Library,
};

export function ChurchIcon({ icon, size = 20 }: { icon: string; size?: number }) {
  const Icon = CHURCH_ICONS[icon] ?? BookOpen;
  return <Icon aria-hidden="true" size={size} strokeWidth={1.7} />;
}

/** Էջի ներքևի տողը՝ որտեղից է վերցված, և խորհուրդ դիմել քահանային։ */
export function SourceNote({ sources = [], reviewing = false }: { sources?: string[]; reviewing?: boolean }) {
  return (
    <footer className="mx-auto mt-7 grid max-w-[560px] gap-1.5 text-center text-[12.5px] leading-relaxed text-muted">
      {sources.length ? <p className="m-0"><span className="font-semibold">Աղբյուր. </span>{sources.join("; ")}</p> : null}
      <p className="m-0">{reviewing ? "⚑ Ստուգվում է հոգևորականի կողմից։ " : ""}Ձեր կոնկրետ դեպքի համար դիմեք ձեր ծխի քահանային։ Հարց ունե՞ք՝ <Link className="text-gold-bright" to="/kap">գրեք մեզ</Link>։</p>
    </footer>
  );
}
