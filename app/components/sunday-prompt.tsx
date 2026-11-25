import { Fragment, useEffect, useState } from "react";
import { useScrollLock } from "../utils/scroll-lock";
import { createPortal } from "react-dom";
import { useRouteLoaderData } from "react-router";

import { sundayToAsk, yerevanDay } from "../utils/liturgy";
import { ChaliceArt } from "./chalice-art";

/**
 * Կիրակնօրյա հարցը. կիրակի 13:00-ից մինչև երկուշաբթի (Երևանի ժամով), միայն մուտք գործածին։
 * Նախ՝ «Մասնակցե՞լ եք Պատարագին», հետո՝ «Ստացե՞լ եք Հաղորդություն», վերջում՝ Հաղորդության աղոթքը։
 * Տեսքը՝ «ուրիշ աշխարհ». ամբողջ էկրան, ոսկե սկիհը նշխարով, հետևում՝ պտտվող արևի շողեր։
 */

export function SundayPrompt() {
  const signedIn = Boolean((useRouteLoaderData("root") as { signedIn?: boolean } | undefined)?.signedIn);
  const [day, setDay] = useState<string | null>(null);
  const [feast, setFeast] = useState<string | null>(null);
  const [communion, setCommunion] = useState(false);
  // «stop»՝ հաստատում «Չհարցնել այլևս»-ից առաջ, որ մարդը սխալմամբ չանջատի։
  const [step, setStep] = useState<"attended" | "communion" | "done" | "stop" | "stopped">("attended");
  const [busy, setBusy] = useState(false);
  // Նախադիտում («Կառավարում»-ից, ?sunday=preview). բացվում է ցանկացած պահի, պատասխանը չի պահվում։
  const [preview, setPreview] = useState(false);
  // Մինչ պատուհանը բաց է, հետևի էջը չի ոլորվում։
  useScrollLock(Boolean(day));

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("sunday") === "preview") {
      setPreview(true);
      setStep("attended");
      // Եթե երեկ կիրակի էր՝ ցույց է տալիս «Երեկ…» տարբերակը, ինչպես իրական երկուշաբթի օրը։
      setDay(sundayToAsk() ?? yerevanDay());
      return;
    }
    if (!signedIn) return;
    // Հարցում ենք սերվերին միայն կիրակի/երկուշաբթի (կամ ծանուցումից եկած «?sunday=1»)։
    const fromNotice = new URLSearchParams(window.location.search).has("sunday");
    const window_ = sundayToAsk();
    if (!window_ && !fromNotice) return;
    void fetch("/api/sunday").then((response) => response.json() as Promise<{ ask: boolean; day: string | null; feast: string | null }>)
      .then((answer) => { if (answer.ask && answer.day) { setDay(answer.day); setFeast(answer.feast); } }).catch(() => undefined);
  }, [signedIn]);

  if (!day || typeof document === "undefined") return null;
  const send = async (body: Record<string, unknown>) => {
    if (preview) return;
    setBusy(true);
    await fetch("/api/sunday", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
  };
  // Երկուշաբթի (կամ տոնի հաջորդ օրը) հարցնում ենք «Երեկ…», ոչ թե «Այսօր…»։
  const when = day === yerevanDay() ? "Այսօր" : "Երեկ";
  const title = feast ? "Օրհնյալ տոն" : "Օրհնյալ կիրակի";
  const gold = "min-h-12 cursor-pointer rounded-button border-0 bg-[linear-gradient(135deg,#fff3c8,#e3b24b)] px-4 text-[15px] font-bold text-[#3a2206] shadow-[0_8px_22px_rgb(240_190_90/45%)] disabled:opacity-60";
  const plain = "sunday-ghost min-h-12 cursor-pointer rounded-button border px-4 text-[15px] font-bold disabled:opacity-60";
  const link = "cursor-pointer border-0 bg-transparent p-1 text-[13px] underline-offset-4 hover:underline";
  const date = new Date(`${day}T12:00:00Z`);
  const dateLine = `${["ԿԻՐԱԿԻ", "ԵՐԿՈՒՇԱԲԹԻ", "ԵՐԵՔՇԱԲԹԻ", "ՉՈՐԵՔՇԱԲԹԻ", "ՀԻՆԳՇԱԲԹԻ", "ՈՒՐԲԱԹ", "ՇԱԲԱԹ"][date.getUTCDay()]} · ${date.getUTCDate()} ${["ՀՈՒՆՎԱՐԻ", "ՓԵՏՐՎԱՐԻ", "ՄԱՐՏԻ", "ԱՊՐԻԼԻ", "ՄԱՅԻՍԻ", "ՀՈՒՆԻՍԻ", "ՀՈՒԼԻՍԻ", "ՕԳՈՍՏՈՍԻ", "ՍԵՊՏԵՄԲԵՐԻ", "ՀՈԿՏԵՄԲԵՐԻ", "ՆՈՅԵՄԲԵՐԻ", "ԴԵԿՏԵՄԲԵՐԻ"][date.getUTCMonth()]}`;
  return createPortal(
    // «Ուրիշ աշխարհ». ամբողջ էկրան, սկիհը արևի շողերով (app.css՝ .sunday-world)։
    <div className="sunday-world fixed inset-0 z-[2060] grid grid-rows-[minmax(0,1fr)_auto] overflow-hidden text-center" role="dialog" aria-modal="true" aria-label="Կիրակնօրյա հարց">
      <div className="sunday-sky" aria-hidden="true">
        <div className="sunday-rays" /><div className="sunday-rays sunday-rays-fine" /><div className="sunday-sun" />
        <div className="sunday-dust">{[8, 22, 36, 50, 64, 78, 92, 15, 85].map((left, index) => <i key={left} style={{ left: `${left}%`, animationDelay: `${index * 0.9}s` }} />)}</div>
        <ChaliceArt className="sunday-chalice" size={180} dark="var(--sunday-outline)" />
      </div>
      <div className="relative mx-auto grid max-h-[100dvh] w-full max-w-[460px] gap-2 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+28px)]">
        <small className="sunday-date text-[11px] font-bold tracking-[3px]">{feast ? feast.toLocaleUpperCase("hy") : dateLine}</small>
        {step === "attended" ? (
          <>
            <h2 className="m-0 font-noto text-[30px] font-semibold">{title}</h2>
            <p className="sunday-muted m-0 mb-3 text-[16px]">{when} մասնակցե՞լ եք Սուրբ Պատարագին</p>
            <div className="grid grid-cols-2 gap-2.5">
              <button className={gold} type="button" disabled={busy} onClick={() => setStep("communion")}>Այո</button>
              <button className={plain} type="button" disabled={busy} onClick={async () => { await send({ attended: false }); setCommunion(false); setStep("done"); }}>Այս անգամ ոչ</button>
            </div>
          </>
        ) : step === "communion" ? (
          <>
            <h2 className="m-0 font-noto text-[30px] font-semibold">{title}</h2>
            <p className="sunday-muted m-0 mb-3 text-[16px]">Ստացե՞լ եք Սուրբ Հաղորդություն</p>
            <div className="grid grid-cols-2 gap-2.5">
              <button className={gold} type="button" disabled={busy} onClick={async () => { await send({ attended: true, communion: true }); setCommunion(true); setStep("done"); }}>Այո</button>
              <button className={plain} type="button" disabled={busy} onClick={async () => { await send({ attended: true, communion: false }); setCommunion(false); setStep("done"); }}>Ոչ</button>
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
          <SundayPrayer withThanks={communion} onDone={() => setDay(null)} />
        )}
        <div className="sunday-muted mt-1 flex justify-center gap-5">
          {step === "stopped" ? <button className={link} type="button" onClick={() => setDay(null)}>Փակել</button> : null}
          {step === "attended" ? <button className={`${link} opacity-70`} type="button" onClick={() => setStep("stop")}>Չհարցնել այլևս</button> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Սբ. Հաղորդություն ստանալուց առաջ և հետո (դասական ուղղագրությամբ, ինչպես աղոթագրքում)։
const PRAYER_BEFORE = ["Պարգեւի՛չ ողորմութեան,", "պարգեւի՛ր ինձ ուղղափառ հաւատով,", "բարի գործերով", "եւ Քո Սուրբ Մարմնի եւ Արեան հաղորդութեամբ", "գալ առ Քեզ։"];
const PRAYER_AFTER = ["Գոհանում եմք Քեզնից,", "Քրիստո՛ս Թագաւոր մեր,", "որ կենարար Մարմնովդ եւ Սուրբ Արիւնովդ", "մեզ կենդանութիւն պարգեւեցիր.", "ամէն։"];
// Տառերը հայտնվում են մեկ-մեկ, արագ (ինչպես գրիչով), բառերը տողից տող չեն կտրվում։
const LETTER_MS = 26;
const PAUSE_MS = 500;

/**
 * Պատասխանից հետո՝ աղոթքը, առանց վերնագրի, կիսաթափանց վահանակի վրա. տառերը հայտնվում են մեկ-մեկ։
 * Հաղորդություն ստացածին՝ երկու մասն էլ («առաջ» և «հետո»), մյուսներին՝ առաջին մասը։
 * «Ամէն» կոճակը երևում է, երբ աղոթքը ամբողջն է գրվել։
 */
function SundayPrayer({ withThanks, onDone }: { withThanks: boolean; onDone: () => void }) {
  const parts = withThanks ? [PRAYER_BEFORE, PRAYER_AFTER] : [PRAYER_BEFORE];
  let letter = 0;
  const paragraphs = parts.map((lines, part) => {
    const words = lines.join(" ").split(" ");
    // Բառը՝ չկտրվող խումբ, բառերի միջև՝ սովորական բացատ (տողը կարող է այնտեղ ընդհատվել)։
    const content = words.map((word, wordIndex) => (
      <Fragment key={wordIndex}>
        <span className="inline-block whitespace-nowrap">
          {[...word].map((character, index) => <span key={index} className="sunday-letter" style={{ animationDelay: `${(letter++) * LETTER_MS + part * PAUSE_MS}ms` }}>{character}</span>)}
        </span>
        {wordIndex < words.length - 1 ? " " : null}
      </Fragment>
    ));
    return <p key={part} className="sunday-prayer m-0">{content}</p>;
  });
  const end = letter * LETTER_MS + parts.length * PAUSE_MS + 400;
  return (
    // Կիսաթափանց վահանակ աղոթքի հետևում, որ տեքստը շողերի վրա հեշտ կարդացվի։
    <div className="sunday-card grid gap-3 rounded-panel px-4 py-4">
      {paragraphs}
      <button className="sunday-prayer-end mx-auto min-h-11 cursor-pointer rounded-button border border-[color-mix(in_srgb,var(--sunday-ink)_35%,transparent)] bg-transparent px-6 text-[14px] font-semibold text-inherit"
        style={{ animationDelay: `${end}ms` }} type="button" onClick={onDone}>Ամէն</button>
    </div>
  );
}
