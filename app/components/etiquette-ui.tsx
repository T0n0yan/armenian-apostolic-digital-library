import { RULE_KINDS, type RuleKind } from "../data/etiquette";
import divider2 from "../assets/divider2.webp";

/** Կանոն / Ավանդույթ / Սնահավատություն պիտակը։ */
export function KindBadge({ kind }: { kind: RuleKind }) {
  return <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${RULE_KINDS[kind].className}`}>{RULE_KINDS[kind].label}</span>;
}

/** Բաժնի տառը թռչնատառով (գունավոր տառատեսակ)։ */
export function BirdLetter({ letter, className = "" }: { letter: string; className?: string }) {
  return <span className={`relative isolate inline-block font-trchnatar leading-none font-normal ${className}`} aria-hidden="true">{letter}</span>;
}

/** Ոսկե զարդանախշի գիծ՝ ինչպես բաժինների վերնագրերի տակ։ */
export function OrnamentDivider({ className = "" }: { className?: string }) {
  return <img src={divider2} alt="" width={1200} height={126} decoding="async" className={`h-[36px] w-full object-contain ${className}`} />;
}
