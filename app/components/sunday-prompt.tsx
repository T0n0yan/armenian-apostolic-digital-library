import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useRouteLoaderData } from "react-router";

import { sundayToAsk } from "../utils/liturgy";
import { ChaliceArt } from "./chalice-art";

/**
 * Կիրակնօրյա հարցը. կիրակի 13:00-ից մինչև երկուշաբթի (Երևանի ժամով), միայն մուտք գործածին։
 * Նախ՝ «Եղե՞լ եք Պատարագի», հետո՝ «Ստացե՞լ եք Հաղորդություն»։ «Ավելի ուշ»-ը թաքցնում է մինչև հաջորդ բացումը։
 * Տեսքը՝ «ուրիշ աշխարհ». ամբողջ էկրան, ոսկե սկիհը նշխարով, հետևում՝ պտտվող արևի շողեր։
 */
const LATER_KEY = "library-sunday-later";

export function SundayPrompt() {
  const signedIn = Boolean((useRouteLoaderData("root") as { signedIn?: boolean } | undefined)?.signedIn);
  const [day, setDay] = useState<string | null>(null);
  const [feast, setFeast] = useState<string | null>(null);
  // «stop»՝ հաստատում «Չհարցնել այլևս»-ից առաջ, որ մարդը սխալմամբ չանջատի։
  const [step, setStep] = useState<"attended" | "communion" | "done" | "stop" | "stopped">("attended");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    // Հարցում ենք սերվերին միայն կիրակի/երկուշաբթի (կամ ծանուցումից եկած «?sunday=1»)։
    const fromNotice = new URLSearchParams(window.location.search).has("sunday");
    const window_ = sundayToAsk();
    if (!window_ && !fromNotice) return;
    try { if (!fromNotice && sessionStorage.getItem(LATER_KEY) === window_) return; } catch { /* private mode */ }
    void fetch("/api/sunday").then((response) => response.json() as Promise<{ ask: boolean; day: string | null; feast: string | null }>)
      .then((answer) => { if (answer.ask && answer.day) { setDay(answer.day); setFeast(answer.feast); } }).catch(() => undefined);
  }, [signedIn]);

  if (!day || typeof document === "undefined") return null;
  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    await fetch("/api/sunday", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
  };
  const later = () => { try { sessionStorage.setItem(LATER_KEY, day); } catch { /* private mode */ } setDay(null); };
  const gold = "min-h-12 cursor-pointer rounded-[16px] border-0 bg-[linear-gradient(135deg,#fff3c8,#e3b24b)] px-4 text-[15px] font-bold text-[#3a2206] shadow-[0_8px_22px_rgb(240_190_90/45%)] disabled:opacity-60";
  const plain = "sunday-ghost min-h-12 cursor-pointer rounded-[16px] border px-4 text-[15px] font-bold disabled:opacity-60";
  const link = "cursor-pointer border-0 bg-transparent p-1 text-[13px] underline-offset-4 hover:underline";
  const date = new Date(`${day}T12:00:00Z`);
  const dateLine = `${["ԿԻՐԱԿԻ", "ԵՐԿՈՒՇԱԲԹԻ", "ԵՐԵՔՇԱԲԹԻ", "ՉՈՐԵՔՇԱԲԹԻ", "ՀԻՆԳՇԱԲԹԻ", "ՈՒՐԲԱԹ", "ՇԱԲԱԹ"][date.getUTCDay()]} · ${date.getUTCDate()} ${["ՀՈՒՆՎԱՐԻ", "ՓԵՏՐՎԱՐԻ", "ՄԱՐՏԻ", "ԱՊՐԻԼԻ", "ՄԱՅԻՍԻ", "ՀՈՒՆԻՍԻ", "ՀՈՒԼԻՍԻ", "ՕԳՈՍՏՈՍԻ", "ՍԵՊՏԵՄԲԵՐԻ", "ՀՈԿՏԵՄԲԵՐԻ", "ՆՈՅԵՄԲԵՐԻ", "ԴԵԿՏԵՄԲԵՐԻ"][date.getUTCMonth()]}`;
  return createPortal(
    // «Ուրիշ աշխարհ». ամբողջ էկրան, սկիհը արևի շողերով (app.css՝ .sunday-world)։
    <div className="sunday-world fixed inset-0 z-[2060] grid grid-rows-[1fr_auto] overflow-hidden text-center" role="dialog" aria-modal="true" aria-label="Կիրակնօրյա հարց">
      <div className="sunday-sky" aria-hidden="true">
        <div className="sunday-rays" /><div className="sunday-rays sunday-rays-fine" /><div className="sunday-sun" />
        <div className="sunday-dust">{[8, 22, 36, 50, 64, 78, 92, 15, 85].map((left, index) => <i key={left} style={{ left: `${left}%`, animationDelay: `${index * 0.9}s` }} />)}</div>
        <ChaliceArt className="sunday-chalice" size={180} dark="var(--sunday-outline)" />
      </div>
      <div className="relative mx-auto grid w-full max-w-[460px] gap-2 px-5 pb-[calc(env(safe-area-inset-bottom)+28px)]">
        <small className="sunday-date text-[11px] font-bold tracking-[3px]">{feast ? feast.toLocaleUpperCase("hy") : dateLine}</small>
        {step === "attended" ? (
          <>
            <h2 className="m-0 font-noto text-[30px] font-semibold">{feast ? "Տոնդ օրհնյալ" : "Օրհնյալ կիրակի"}</h2>
            <p className="sunday-muted m-0 mb-3 text-[16px]">Այսօր եղե՞լ եք Սուրբ Պատարագի</p>
            <div className="grid grid-cols-2 gap-2.5">
              <button className={gold} type="button" disabled={busy} onClick={() => setStep("communion")}>Այո</button>
              <button className={plain} type="button" disabled={busy} onClick={async () => { await send({ attended: false }); setStep("done"); }}>Այս անգամ ոչ</button>
            </div>
          </>
        ) : step === "communion" ? (
          <>
            <h2 className="m-0 font-noto text-[28px] font-semibold">Փառք Աստծո</h2>
            <p className="sunday-muted m-0 mb-3 text-[16px]">Ստացե՞լ եք Սուրբ Հաղորդություն</p>
            <div className="grid grid-cols-2 gap-2.5">
              <button className={gold} type="button" disabled={busy} onClick={async () => { await send({ attended: true, communion: true }); setStep("done"); }}>Այո</button>
              <button className={plain} type="button" disabled={busy} onClick={async () => { await send({ attended: true, communion: false }); setStep("done"); }}>Ոչ</button>
            </div>
          </>
        ) : step === "stop" ? (
          <>
            <h2 className="m-0 font-noto text-[24px] font-semibold">Այլևս չհարցնե՞լ</h2>
            <p className="sunday-muted m-0 mb-3 text-[14px]">Կարող եք նորից միացնել ցանկացած պահի՝ Մենյու → Կարգավորումներ։</p>
            <div className="grid grid-cols-2 gap-2.5">
              <button className={plain} type="button" disabled={busy} onClick={async () => { await send({ prompt: false }); setStep("stopped"); }}>Այո, չհարցնել</button>
              <button className={gold} type="button" onClick={() => setStep("attended")}>Հետ</button>
            </div>
          </>
        ) : step === "stopped" ? (
          <p className="sunday-muted m-0 my-3 text-[15px]">Լավ, այլևս չենք հարցնի։ Նորից միացնելու համար՝ Մենյու → Կարգավորումներ → «Կիրակնօրյա հարց»։</p>
        ) : (
          <>
            <h2 className="m-0 font-noto text-[28px] font-semibold">Շնորհակալություն 🙏</h2>
            <p className="sunday-muted m-0 mb-3 text-[16px]">Աստված օրհնի Ձեր շաբաթը</p>
            <Link className={`${gold} inline-flex items-center justify-center no-underline`} to="/my-year" onClick={() => setDay(null)}>Իմ տարին</Link>
          </>
        )}
        <div className="sunday-muted mt-1 flex justify-center gap-5">
          {step === "attended" || step === "communion" ? <button className={link} type="button" onClick={later}>Ավելի ուշ</button> : step !== "stop" ? <button className={link} type="button" onClick={() => setDay(null)}>Փակել</button> : null}
          {step === "attended" ? <button className={`${link} opacity-70`} type="button" onClick={() => setStep("stop")}>Չհարցնել այլևս</button> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
