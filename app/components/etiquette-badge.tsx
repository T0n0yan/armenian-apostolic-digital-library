import { RULE_KINDS, type RuleKind } from "../data/etiquette";

/** Կանոն / Ավանդույթ / Սնահավատություն պիտակը։ */
export function KindBadge({ kind }: { kind: RuleKind }) {
  return <span className={`inline-flex w-fit items-center rounded-chip px-2.5 py-0.5 text-[12px] font-bold ${RULE_KINDS[kind].className}`}>{RULE_KINDS[kind].label}</span>;
}
