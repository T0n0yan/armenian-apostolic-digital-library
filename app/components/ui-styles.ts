export const focusRing =
  "outline-none focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/42%)] focus-visible:ring-offset-3";

export const paperPanel = "paper-panel";

export const interactiveCard = `paper-card ${focusRing}`;

export const iconButton =
  `grid size-[36px] shrink-0 cursor-pointer place-items-center rounded-control border border-edge bg-subtle p-0 text-muted transition-[border-color,color,background,transform,translate,scale] duration-[160ms] hover:-translate-y-px hover:border-[rgb(217_181_111/34%)] hover:bg-sheen hover:text-gold-bright ${focusRing}`;

export const fieldControl =
  "min-h-[48px] w-full rounded-button border border-[var(--field-border)] bg-control px-[13px] py-[11px] text-[16px] text-ink shadow-[inset_0_1px_0_rgb(255_255_255/6%)] outline-none transition-[border-color,box-shadow,background] duration-[160ms] placeholder:text-faint focus:border-[rgb(217_181_111/48%)] focus:bg-surface-strong focus:shadow-[0_0_0_3px_rgb(217_181_111/10%)] aria-[invalid=true]:border-[rgb(239_145_136/62%)]";

export const fieldLabel = "grid gap-[8px] text-[13px] font-[720]";
export const fieldHint = "m-0 text-[12px] leading-[18px] text-faint";

export const panelSection = `${paperPanel} p-[18px] min-[560px]:p-[24px] min-[960px]:p-[28px]`;

export const primaryButton =
  `inline-flex min-h-[46px] cursor-pointer items-center justify-center gap-[8px] rounded-button border border-[rgb(217_181_111/24%)] bg-[linear-gradient(135deg,#7b4a8e,#5c326d)] px-[18px] py-[11px] text-[14px] font-[760] text-[#fffaf3] shadow-card transition-[filter,transform,translate,scale] duration-[160ms] hover:-translate-y-px hover:brightness-110 disabled:cursor-wait disabled:opacity-60 ${focusRing}`;

export const sectionHeader = "flex items-center justify-between gap-[12px] px-[4px]";
export const sectionTitle = "m-0 text-[12px] font-semibold tracking-[1.6px] text-gold uppercase";
export const countBadge =
  "grid min-h-[26px] min-w-[26px] place-items-center rounded-full border border-[rgb(217_181_111/30%)] px-[8px] text-[12px] text-gold-bright tabular-nums";
