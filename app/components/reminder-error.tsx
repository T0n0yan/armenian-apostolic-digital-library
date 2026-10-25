import { useEffect, useState } from "react";
import { REMINDER_ERROR_EVENT } from "../utils/reminder-store";

export function ReminderError() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = () => setVisible(true);
    window.addEventListener(REMINDER_ERROR_EVENT, show);
    return () => window.removeEventListener(REMINDER_ERROR_EVENT, show);
  }, []);
  if (!visible) return null;
  return <div role="alert" className="fixed inset-x-3 top-4 z-[100] mx-auto max-w-md rounded-2xl border border-glass-border bg-[var(--page-bg)] p-4 text-sm text-ink shadow-lg">
    <p className="m-0">Փոփոխությունը չհաջողվեց պահպանել։ Ստուգեք կապը և փորձեք կրկին։</p>
    <button type="button" className="mt-2 min-h-11 px-3 font-bold text-gold-bright" onClick={() => setVisible(false)}>Փակել</button>
  </div>;
}
