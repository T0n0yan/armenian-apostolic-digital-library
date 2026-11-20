import { DoorOpen, Flame, Gift, HandHeart, Home, Music, ShieldQuestion, Sparkles, Wine, type LucideIcon } from "lucide-react";
import { RULE_KINDS, type RuleKind } from "../data/etiquette";

/** Կանոն / Ավանդույթ / Սնահավատություն պիտակը։ */
export function KindBadge({ kind }: { kind: RuleKind }) {
  return <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${RULE_KINDS[kind].className}`}>{RULE_KINDS[kind].label}</span>;
}

/** Ամեն բաժնի պատկերակը (ճանապարհի կանգառները)։ */
export const TOPIC_ICONS: Record<string, LucideIcon> = {
  entrance: DoorOpen,
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
export const card = "rounded-card bg-[var(--card-glass)] border border-glass-border shadow-[0_1px_2px_rgb(92_64_30/8%)]";
export const groupTitle = "m-0 px-1 text-[12px] font-bold tracking-[1.2px] text-gold uppercase";
