import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useRouteLoaderData } from "react-router";

const SEEN_KEY = "private-letter-seen";

/** «💌 Քեզ համար նամակ կա». միայն ստացողին (root-ը տալիս է նամակի տարբերակը), մինչև բացի կամ փակի։ */
export function PrivateLetterNudge() {
  const version = (useRouteLoaderData("root") as { privateLetter?: string | null } | undefined)?.privateLetter ?? null;
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!version || pathname === "/namak") return;
    let seen: string | null = null;
    try { seen = localStorage.getItem(SEEN_KEY); } catch { /* պահեստը փակ է */ }
    if (seen === version) return;
    const timer = window.setTimeout(() => setOpen(true), 1800); // մոմի անիմացիայից հետո
    return () => window.clearTimeout(timer);
  }, [version, pathname]);

  const close = () => {
    setOpen(false);
    try { if (version) localStorage.setItem(SEEN_KEY, version); } catch { /* պահեստը փակ է */ }
  };

  if (!open || !version || typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--tg-inset-top,0px)+12px)] z-[2060] flex justify-center px-3" role="dialog" aria-label="Նամակ քեզ համար">
      <div data-phase="in" className="install-toast pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-[20px] border border-[rgb(217_181_111/45%)] bg-[var(--page-bg)] p-3.5 text-ink shadow-[0_18px_44px_rgb(40_20_10/26%)]">
        <span className="text-[30px] leading-none" aria-hidden="true">💌</span>
        <Link className="grid flex-1 gap-0.5 text-ink no-underline" to="/namak" onClick={close}>
          <strong className="text-[15px]">Քեզ համար նամակ կա</strong>
          <span className="text-[13px] text-gold-bright">Բացել</span>
        </Link>
        <button className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted" type="button" onClick={close} aria-label="Փակել"><X aria-hidden="true" size={18} /></button>
      </div>
    </div>,
    document.body,
  );
}
