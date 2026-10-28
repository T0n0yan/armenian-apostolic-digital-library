import { Crown, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Form, useNavigation } from "react-router";

import { primaryButton } from "./ui-styles";

/**
 * What one admin may do, chosen by the owner: a box per permission and «Գլխավոր ադմին». Whatever
 * is ticked, the «Կառավարում» page stays the owner's alone.
 */
export function AdminRightsDialog({ person, permissions, onClose }: {
  person: { id: string; displayName: string; owner: boolean; permissions: string[] };
  permissions: Record<string, string>;
  onClose: () => void;
}) {
  const busy = useNavigation().state !== "idle";
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const box = "flex cursor-pointer items-start gap-3 rounded-[14px] border border-glass-border bg-subtle px-3 py-2.5 text-[14px] text-ink";
  return createPortal(
    <div className="fixed inset-0 z-[2100] grid place-items-center bg-[rgb(8_4_10/70%)] p-4" role="dialog" aria-modal="true" aria-labelledby="rights-title" onClick={onClose}>
      <Form method="post" preventScrollReset className="grid max-h-[90svh] border border-glass-border bg-[var(--page-bg)] w-full max-w-[460px] gap-3 overflow-y-auto rounded-[22px] p-4 shadow-glass" onClick={(event) => event.stopPropagation()}>
        <input type="hidden" name="intent" value="admin-rights" />
        <input type="hidden" name="userId" value={person.id} />
        <div className="flex items-start justify-between gap-2">
          <div className="grid gap-0.5">
            <h2 className="m-0 text-[17px] font-bold text-ink" id="rights-title">{person.displayName}</h2>
            <span className="text-[12.5px] text-muted">Ինչ կարող է անել այս ադմինը</span>
          </div>
          <button className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-subtle text-muted" type="button" onClick={onClose} aria-label="Փակել"><X aria-hidden="true" size={18} /></button>
        </div>
        {Object.entries(permissions).map(([id, label]) => (
          <label key={id} className={box}>
            <input className="mt-0.5 size-5 shrink-0 accent-[#b07d2e]" type="checkbox" name="permissions" value={id} defaultChecked={person.permissions.includes(id)} />
            <span>{label}</span>
          </label>
        ))}
        <p className="m-0 rounded-[14px] bg-[rgb(217_181_111/10%)] px-3 py-2.5 text-[12.5px] leading-relaxed text-muted">
          «Կառավարում» էջը (բոտ, հրապարակողներ, ադմիններ, համաժամեցում) միշտ միայն գլխավոր ադմինինն է. ոչ մի նշում այն չի բացում։
        </p>
        <label className={`${box} border-[rgb(184_72_62/40%)]`}>
          <input className="mt-0.5 size-5 shrink-0 accent-[#b8483e]" type="checkbox" name="owner" defaultChecked={person.owner} />
          <span className="grid gap-0.5">
            <span className="flex items-center gap-1.5 font-semibold"><Crown aria-hidden="true" size={15} className="text-gold" /> Գլխավոր ադմին</span>
            <span className="text-[12px] text-muted">Ամեն ինչ, ներառյալ «Կառավարում»-ը և այլ ադմիններ նշանակելը։ Միայն ձեր սեփական հաշիվների համար (օր.՝ Google-ի և Telegram-ի)։</span>
          </span>
        </label>
        <button className={primaryButton} type="submit" disabled={busy}>Պահել</button>
      </Form>
    </div>,
    document.body,
  );
}
