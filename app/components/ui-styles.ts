export const focusRing =
  "outline-none focus-visible:ring-3 focus-visible:ring-[rgb(217_181_111/42%)] focus-visible:ring-offset-3";

export const glassPanel = "frosted-panel";

export const glassCard = "frosted-card";

export const interactiveGlassCard = `frosted-card ${focusRing}`;

export const iconButton =
  `grid size-[36px] shrink-0 cursor-pointer place-items-center rounded-[12px] border border-glass-border bg-subtle p-0 text-muted transition-[border-color,color,background,transform,translate,scale] duration-[160ms] hover:-translate-y-px hover:border-[rgb(217_181_111/34%)] hover:bg-glass-highlight hover:text-gold-bright ${focusRing}`;

export const fieldControl =
  "min-h-[48px] w-full rounded-[14px] border border-glass-border bg-control px-[13px] py-[11px] text-[16px] text-ink shadow-[inset_0_1px_0_rgb(255_255_255/6%)] outline-none transition-[border-color,box-shadow,background] duration-[160ms] placeholder:text-faint focus:border-[rgb(217_181_111/48%)] focus:bg-glass-strong focus:shadow-[0_0_0_3px_rgb(217_181_111/10%)] aria-[invalid=true]:border-[rgb(239_145_136/62%)]";

export const fieldLabel = "grid gap-[8px] text-[13px] font-[720]";
export const fieldHint = "m-0 text-[12px] leading-[18px] text-faint";
export const fieldError = "m-0 text-[12px] leading-[18px] font-[650] text-danger";

export const formLayout =
  "grid gap-[18px] [&_.form-field]:grid [&_.form-field]:gap-[8px] [&_.form-field>label]:text-[13px] [&_.form-field>label]:font-[720] [&_.form-field_input]:min-h-[48px] [&_.form-field_input]:w-full [&_.form-field_input]:rounded-[14px] [&_.form-field_input]:border [&_.form-field_input]:border-glass-border [&_.form-field_input]:bg-control [&_.form-field_input]:px-[13px] [&_.form-field_input]:py-[11px] [&_.form-field_input]:text-[16px] [&_.form-field_input]:text-ink [&_.form-field_input]:shadow-[inset_0_1px_0_rgb(255_255_255/6%)] [&_.form-field_input]:outline-none [&_.form-field_select]:min-h-[48px] [&_.form-field_select]:w-full [&_.form-field_select]:rounded-[14px] [&_.form-field_select]:border [&_.form-field_select]:border-glass-border [&_.form-field_select]:bg-control [&_.form-field_select]:px-[13px] [&_.form-field_select]:py-[11px] [&_.form-field_select]:pr-[42px] [&_.form-field_select]:text-[16px] [&_.form-field_select]:text-ink [&_.form-field_select]:shadow-[inset_0_1px_0_rgb(255_255_255/6%)] [&_.form-field_select]:outline-none [&_.form-field_textarea]:w-full [&_.form-field_textarea]:resize-y [&_.form-field_textarea]:rounded-[14px] [&_.form-field_textarea]:border [&_.form-field_textarea]:border-glass-border [&_.form-field_textarea]:bg-control [&_.form-field_textarea]:px-[13px] [&_.form-field_textarea]:py-[11px] [&_.form-field_textarea]:text-[16px] [&_.form-field_textarea]:leading-[24px] [&_.form-field_textarea]:text-ink [&_.form-field_textarea]:shadow-[inset_0_1px_0_rgb(255_255_255/6%)] [&_.form-field_textarea]:outline-none [&_.form-field_:is(input,select,textarea)]:transition-[border-color,box-shadow,background] [&_.form-field_:is(input,select,textarea)]:duration-[160ms] [&_.form-field_:is(input,select,textarea):focus]:border-[rgb(217_181_111/48%)] [&_.form-field_:is(input,select,textarea):focus]:bg-glass-strong [&_.form-field_:is(input,select,textarea):focus]:shadow-[0_0_0_3px_rgb(217_181_111/10%)] [&_.form-field_:is(input,select,textarea)[aria-invalid=true]]:border-[rgb(239_145_136/62%)]";

export const panelSection = `${glassPanel} p-[18px] min-[560px]:p-[24px] min-[960px]:p-[28px]`;
export const panelEyebrow =
  "m-0 text-[12px] font-extrabold tracking-[1.6px] text-gold uppercase min-[960px]:text-[13px]";
export const panelTitle =
  "mt-[6px] mb-0 text-[16px] leading-[22px] min-[960px]:text-[20px] min-[960px]:leading-[26px]";

export const primaryButton =
  `inline-flex min-h-[46px] cursor-pointer items-center justify-center gap-[8px] rounded-[14px] border border-[rgb(217_181_111/24%)] bg-[linear-gradient(135deg,#7b4a8e,#5c326d)] px-[18px] py-[11px] text-[14px] font-[760] text-[#fffaf3] shadow-card transition-[filter,transform,translate,scale] duration-[160ms] hover:-translate-y-px hover:brightness-110 disabled:cursor-wait disabled:opacity-60 ${focusRing}`;

export const sectionHeader = "flex items-center justify-between gap-[12px] px-[4px]";
export const sectionTitle = "m-0 text-[12px] font-semibold tracking-[1.6px] text-gold uppercase";
export const countBadge =
  "grid min-h-[26px] min-w-[26px] place-items-center rounded-full border border-[rgb(217_181_111/30%)] px-[8px] text-[12px] text-gold-bright tabular-nums";
