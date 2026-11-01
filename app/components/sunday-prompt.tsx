import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useRouteLoaderData } from "react-router";

import { sundayToAsk } from "../utils/liturgy";

/**
 * Կիրակնօրյա հարցը. կիրակի 13:00-ից մինչև երկուշաբթի (Երևանի ժամով), միայն մուտք գործածին։
 * Նախ՝ «Եղե՞լ եք Պատարագի», հետո՝ «Ստացե՞լ եք Հաղորդություն»։ «Ավելի ուշ»-ը թաքցնում է մինչև հաջորդ բացումը։
 * Հիմա պարզ տեսք է. ճոխ («ուրիշ աշխարհ») դիզայնը՝ հաջորդ փուլում։
 */
const LATER_KEY = "library-sunday-later";

export function SundayPrompt() {
  const signedIn = Boolean((useRouteLoaderData("root") as { signedIn?: boolean } | undefined)?.signedIn);
  const [day, setDay] = useState<string | null>(null);
  const [step, setStep] = useState<"attended" | "communion" | "done">("attended");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    // Հարցում ենք սերվերին միայն կիրակի/երկուշաբթի (կամ ծանուցումից եկած «?sunday=1»)։
    const fromNotice = new URLSearchParams(window.location.search).has("sunday");
    const window_ = sundayToAsk();
    if (!window_ && !fromNotice) return;
    try { if (!fromNotice && sessionStorage.getItem(LATER_KEY) === window_) return; } catch { /* private mode */ }
    void fetch("/api/sunday").then((response) => response.json() as Promise<{ ask: boolean; day: string | null }>)
      .then((answer) => { if (answer.ask && answer.day) setDay(answer.day); }).catch(() => undefined);
  }, [signedIn]);

  if (!day || typeof document === "undefined") return null;
  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    await fetch("/api/sunday", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
  };
  const later = () => { try { sessionStorage.setItem(LATER_KEY, day); } catch { /* private mode */ } setDay(null); };
  const button = "min-h-11 cursor-pointer rounded-[14px] border px-4 text-[14px] font-semibold disabled:opacity-60";
  const gold = `${button} border-0 bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] text-[#2a1708]`;
  const plain = `${button} border-[rgb(217_181_111/40%)] bg-transparent text-gold-bright`;
  return createPortal(
    <div className="fixed inset-x-3 bottom-[calc(var(--tg-inset-bottom,0px)+90px)] z-[2060] mx-auto grid max-w-[460px] gap-3 rounded-[22px] border border-[rgb(217_181_111/55%)] bg-[var(--page-bg)] p-4 text-center shadow-[0_22px_50px_rgb(40_20_10/32%)]" role="dialog" aria-label="Կիրակնօրյա հարց">
      {step === "attended" ? (
        <>
          <strong className="text-[17px] text-ink">🕊 Օրհնյալ կիրակի</strong>
          <p className="m-0 text-[15px] text-ink">Այսօր եղե՞լ եք Սուրբ Պատարագի։</p>
          <div className="grid grid-cols-2 gap-2">
            <button className={gold} type="button" disabled={busy} onClick={() => setStep("communion")}>Այո</button>
            <button className={plain} type="button" disabled={busy} onClick={async () => { await send({ attended: false }); setStep("done"); }}>Ոչ, այս անգամ ոչ</button>
          </div>
        </>
      ) : step === "communion" ? (
        <>
          <p className="m-0 text-[15px] text-ink">Ստացե՞լ եք Սուրբ Հաղորդություն։</p>
          <div className="grid grid-cols-2 gap-2">
            <button className={gold} type="button" disabled={busy} onClick={async () => { await send({ attended: true, communion: true }); setStep("done"); }}>Այո</button>
            <button className={plain} type="button" disabled={busy} onClick={async () => { await send({ attended: true, communion: false }); setStep("done"); }}>Ոչ</button>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 text-[15px] text-ink">Շնորհակալություն 🙏 Աստված օրհնի Ձեր շաբաթը։</p>
          <Link className="text-[13.5px] font-semibold text-gold-bright" to="/my-year" onClick={() => setDay(null)}>Իմ տարին →</Link>
        </>
      )}
      <div className="flex justify-center gap-4 text-[12.5px]">
        {step !== "done" ? <button className="cursor-pointer border-0 bg-transparent text-muted underline" type="button" onClick={later}>Ավելի ուշ</button> : <button className="cursor-pointer border-0 bg-transparent text-muted underline" type="button" onClick={() => setDay(null)}>Փակել</button>}
        {step === "attended" ? <button className="cursor-pointer border-0 bg-transparent text-faint underline" type="button" onClick={async () => { await send({ prompt: false }); setDay(null); }}>Չհարցնել այլևս</button> : null}
      </div>
    </div>,
    document.body,
  );
}
