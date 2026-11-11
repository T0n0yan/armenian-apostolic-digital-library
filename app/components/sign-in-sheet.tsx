import { LogIn } from "lucide-react";
import { useState, type ReactNode } from "react";

import { BottomSheet } from "./bottom-sheet";

/**
 * «Մուտք գործեք, որպեսզի …»՝ չգրանցված այցելուին, երբ սեղմում է միայն մուտք գործածների համար
 * նախատեսված բանի վրա (եղել եմ, իմ մոտակայքում, սրբավայր ավելացնել/լրացնել)։
 * Մուտքից հետո մարդը վերադառնում է նույն էջը։
 */
export function SignInSheet({ open, onClose, reason, hint = "Քարտեզը և ճանապարհը (Google, Yandex) հասանելի են առանց մուտքի։" }: { open: boolean; onClose: () => void; reason: string; hint?: string }) {
  const back = typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
  const button = "flex min-h-12 w-full items-center justify-center gap-3 glass-tile rounded-button px-3.5 text-[14px] font-semibold text-ink no-underline shadow-card";
  return (
    <BottomSheet open={open} onClose={onClose} label="Մուտք" className="justify-items-center gap-3 p-5 text-center">
      <span className="grid size-12 place-items-center rounded-full border border-[rgb(217_181_111/30%)] bg-[rgb(217_181_111/10%)] text-gold-bright"><LogIn aria-hidden="true" size={22} /></span>
      <h2 className="m-0 font-noto text-[18px] leading-snug text-ink">Մուտք գործեք</h2>
      <p className="m-0 max-w-[340px] text-[13.5px] leading-relaxed text-muted">Մուտք գործեք, որպեսզի {reason}։ {hint}</p>
      <div className="mt-1 grid w-full max-w-[320px] gap-2">
        <a className={button} href={`/auth/google?return=${encodeURIComponent(back)}`}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Մուտք Google-ով
        </a>
        <a className={button} href={`/auth/telegram/start?return=${encodeURIComponent(back)}`}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#2AABEE" /><path fill="#fff" d="M5.4 11.8l11.6-4.5c.54-.2 1 .13.83.94l-1.98 9.3c-.15.66-.54.82-1.1.51l-3-2.22-1.45 1.4c-.16.16-.3.3-.6.3l.21-3.05 5.56-5.02c.24-.21-.05-.33-.38-.12l-6.87 4.33-2.96-.92c-.64-.2-.66-.64.14-.95z" /></svg>
          Մուտք Telegram-ով
        </a>
        <button type="button" className="min-h-11 cursor-pointer border-0 bg-transparent text-[13.5px] text-gold-bright" onClick={onClose}>Ոչ հիմա</button>
      </div>
    </BottomSheet>
  );
}

/** Մեկ տեղից օգտագործելու համար. `guard(reason, action)`-ը գրանցվածի համար կատարում է action-ը, մյուսներին՝ բացում պատուհանը։ */
export function useSignInGuard(signedIn: boolean): [ReactNode, (reason: string, action: () => void) => void] {
  const [reason, setReason] = useState<string | null>(null);
  const sheet = <SignInSheet open={reason !== null} onClose={() => setReason(null)} reason={reason ?? ""} />;
  return [sheet, (why, action) => { if (signedIn) action(); else setReason(why); }];
}
