import { useEffect, useRef, useState } from "react";

// Intro on the first visit of a session: the unlit candle (0.7 s), a spark and the flame catching
// (~0.9 s), then the light settles and welcomes the reader before the page opens (3.6 s at least,
// so it is felt even on fast connections), and finally the light swells from the flame over the
// whole screen and lifts to show the page. Մոմի տակ տառ առ տառ գրվում է խոսքը, և վերջին տառից
// կես վայրկյան հետո է սկսվում լույսի ալիքը։ The page keeps loading underneath meanwhile.
const LIGHT_AT_MS = 700;
const EXIT_MS = 2_000;

// Մոմի տակ տառ առ տառ գրվող խոսքը՝ Մատթ. 28:20, Էջմիածնի Աստվածաշնչից (տերը ստուգել է գրքով)։
// Երկու տող՝ ստորակետից հետո դադարով, ինչպես կարդալիս։
const VERSE_LINES = ["«…Ես ձեզ հետ եմ բոլոր օրերին,", "մինչև աշխարհի վախճանը»"];
const VERSE_REF = "Մատթ. 28:20";
// Գրելը սկսվում է, երբ բոցը արդեն բռնկվել է։
const VERSE_START_MS = 900;
const LETTER_STEP_MS = 52;
const SPACE_PAUSE_MS = 80;
const LINE_PAUSE_MS = 450;
const LETTER_MS = 650;
// Վերջին տառից կես վայրկյան հետո լույսը բացում է էջը։
const AFTER_VERSE_MS = 500;

// Ամեն տառի սկսելու պահը (մոմի վառվելուց հաշված)՝ տող → բառ → տառ։
const VERSE = (() => {
  let at = VERSE_START_MS;
  return VERSE_LINES.map((line, lineIndex) => {
    if (lineIndex > 0) at += LINE_PAUSE_MS;
    return line.split(" ").map((word, wordIndex) => {
      if (wordIndex > 0) at += SPACE_PAUSE_MS;
      return Array.from(word).map((letter) => { const delay = at; at += LETTER_STEP_MS; return { letter, delay }; });
    });
  });
})();
const LAST_LETTER_DELAY = VERSE.at(-1)!.at(-1)!.at(-1)!.delay;
const MINIMUM_VISIBLE_MS = LIGHT_AT_MS + LAST_LETTER_DELAY + LETTER_MS + AFTER_VERSE_MS;
const SESSION_KEY = "library-loader-seen-v4";
// Օրը մեկ անգամ (Երևանի օրով). Telegram-ը Mini App-ի ամեն բացումը նոր session է համարում, և
// ~8 վայրկյանանոց ներածությունը ամեն անգամ փակում էր էջը (նույն ստուգումը՝ boot-script.ts-ում)։
const DAY_KEY = "library-loader-day";
const yerevanDay = () => new Date(Date.now() + 4 * 60 * 60_000).toISOString().slice(0, 10);
/** Մատով սեղմելիս ներածությունը արագ է բացում էջը։ */
const SKIP_EXIT_MS = 400;

type Phase = "unlit" | "lit" | "hidden" | "removed";

const styles = `
html[data-intro-seen] .candle-loader{display:none}
html:not([data-intro-seen]):has(.candle-loader:not([data-phase="hidden"])){overflow:hidden}
.candle-loader{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;overflow:hidden;background:#07040a;transition:opacity .8s ease 1.1s}
.candle-loader[data-phase="hidden"]{opacity:0;pointer-events:none}
.candle-loader[data-skip]{transition:opacity .35s ease}
.candle-loader[data-phase="hidden"] .candle-loader__light{scale:3.4}
/* The welcome: the flame's light swells from the wick until it fills the screen with the page's
   own colour, then the curtain of light lifts. */
.candle-loader__dawn{position:absolute;left:50%;top:58px;width:160px;height:160px;margin:-80px 0 0 -80px;border-radius:50%;pointer-events:none;
  background:radial-gradient(circle,#fffaf0 0%,#ffe7b0 22%,var(--page-bg,#efe2c6) 58%,var(--page-bg,#efe2c6) 100%);
  scale:0;opacity:0;transition:scale 1.5s cubic-bezier(.55,0,.25,1),opacity .5s ease}
.candle-loader[data-phase="hidden"] .candle-loader__dawn{scale:16;opacity:1}
/* The light swallows the candle: the dawn sits above it, and the candle fades out. */
.candle-loader__dawn{z-index:5}
.candle-loader__scene>svg{transition:opacity .7s ease}
.candle-loader[data-phase="hidden"] .candle-loader__scene>svg{opacity:0}
/* Մոմը բարձրացված է, որ մոմը և տակի խոսքը միասին լինեն էկրանի կենտրոնում։ */
.candle-loader__scene{position:relative;width:120px;height:170px;transform:scale(.9);margin-bottom:130px}
/* On tall phones the eye's centre sits above the geometric one. */
@media(max-aspect-ratio:10/17){.candle-loader__scene{margin-bottom:min(30svh,220px)}}
.candle-loader__light{position:absolute;left:50%;top:40px;width:520px;height:520px;margin:-260px 0 0 -260px;border-radius:50%;
  background:radial-gradient(circle,rgb(255 190 100/34%) 0%,rgb(255 150 60/14%) 22%,rgb(120 60 20/6%) 42%,transparent 62%);animation:candle-glow 3s ease-in-out infinite}
.candle-loader__glow{position:absolute;left:50%;top:22px;width:110px;height:110px;margin-left:-55px;border-radius:50%;background:radial-gradient(circle,rgb(255 214 140/55%),rgb(255 170 60/16%) 45%,transparent 70%);animation:candle-glow 2.4s ease-in-out infinite}
.candle-loader__flame{position:absolute;left:50%;top:44px;width:18px;height:34px;margin-left:-9px;transform-origin:50% 100%;animation:candle-flicker 1.4s ease-in-out infinite;filter:drop-shadow(0 0 6px rgb(255 190 90/80%))}
.candle-loader[data-phase="unlit"] .candle-loader__flame{animation:none;opacity:0;scale:.2 .1}
/* The flicker and glow animations own opacity and transform, so the phases use the separate scale property. */
.candle-loader[data-phase="unlit"] .candle-loader__light,.candle-loader[data-phase="unlit"] .candle-loader__glow{animation:none;opacity:0;scale:.4}
.candle-loader__flame,.candle-loader__light,.candle-loader__glow{transition:opacity .9s ease,scale 1.2s cubic-bezier(.2,.9,.3,1.2)}
.candle-loader__spark{position:absolute;left:50%;top:70px;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:#fff3c4;box-shadow:0 0 12px 4px rgb(255 200 110/80%);opacity:0}
.candle-loader[data-phase="lit"] .candle-loader__spark{animation:candle-spark .7s ease-out forwards}
@keyframes candle-spark{0%{opacity:0;transform:translateY(8px) scale(.4)}35%{opacity:1;transform:translateY(-4px) scale(1.4)}100%{opacity:0;transform:translateY(-14px) scale(.2)}}
/* Խոսքը. ոսկեգույն, ամեն տառը մոմի լույսից է «վառվում»։ Դրված է scene-ի մեջ, որ լույսի ալիքը (dawn) ծածկի այն։ */
.candle-loader__verse{position:absolute;left:50%;top:196px;width:min(88vw,560px);translate:-50% 0;margin:0;text-align:center;
  font-family:"Arian Grqi","Noto Serif Armenian",Georgia,serif;font-weight:400;font-size:clamp(19px,5.4vw,30px);line-height:1.45;letter-spacing:.02em;
  color:#e6c27a;text-wrap:balance;text-shadow:0 0 14px rgb(255 196 110/28%)}
.candle-loader__line{display:block}
.candle-loader__word{display:inline-block;white-space:nowrap}
.candle-loader__letter{display:inline-block;opacity:0}
.candle-loader[data-phase]:not([data-phase="unlit"]) .candle-loader__letter{animation:verse-letter .65s cubic-bezier(.2,.7,.2,1) both}
@keyframes verse-letter{
  0%{opacity:0;transform:translateY(.35em) scale(.9);filter:blur(6px);color:#fff6dc;text-shadow:0 0 22px rgb(255 214 140/90%)}
  45%{opacity:1;color:#fff1c8;text-shadow:0 0 18px rgb(255 206 120/75%)}
  100%{opacity:1;transform:none;filter:blur(0);color:#e6c27a;text-shadow:0 0 14px rgb(255 196 110/28%)}}
.candle-loader__ref{display:block;margin-top:10px;font-family:"Noto Serif Armenian",Georgia,serif;font-size:13px;letter-spacing:.22em;color:#a8874f;opacity:0}
.candle-loader[data-phase]:not([data-phase="unlit"]) .candle-loader__ref{animation:verse-ref .9s ease both}
@keyframes verse-ref{from{opacity:0;transform:translateY(4px)}to{opacity:.85;transform:none}}
@media(prefers-reduced-motion:reduce){.candle-loader__flame,.candle-loader__glow,.candle-loader__light{animation:none}}
`;

/**
 * First-visit intro: an unlit candle catches fire and its light opens the page like dawn. Later
 * navigations in the same session skip it.
 */
export function CandleLoader() {
  // Drawn in the server HTML too, so it covers the page from the first paint instead of the page
  // showing and the intro jumping over it after hydration. The boot script in root.tsx marks
  // <html data-intro-seen> before paint for visitors who saw it this session (it stays hidden), and
  // readers without JavaScript never see it (<noscript> below).
  const [phase, setPhase] = useState<Phase>("unlit");
  const [skipped, setSkipped] = useState(false);
  const skippedRef = useRef(false);
  const skip = () => {
    if (phase === "hidden" || phase === "removed") return;
    skippedRef.current = true;
    markSeen();
    setSkipped(true);
    setPhase("hidden");
    window.setTimeout(() => setPhase("removed"), SKIP_EXIT_MS);
  };

  useEffect(() => {
    let active = true;
    const timers: number[] = [];
    const later = (callback: () => void, ms: number) => { timers.push(window.setTimeout(() => active && !skippedRef.current && callback(), ms)); };
    let seen = false;
    try { seen = sessionStorage.getItem(SESSION_KEY) === "1" || localStorage.getItem(DAY_KEY) === yerevanDay(); } catch { /* Storage may be blocked. */ }
    if (seen) {
      // Later visits skip the intro; the light-flood exit is only for the first one.
      setPhase("removed");
      return () => { active = false; timers.forEach(clearTimeout); };
    }
    setPhase("unlit");
    later(() => setPhase("lit"), LIGHT_AT_MS);
    // Intro only: fonts, images and network requests never prolong it.
    later(() => {
      markSeen();
      setPhase("hidden");
      later(() => setPhase("removed"), EXIT_MS);
    }, MINIMUM_VISIBLE_MS);
    return () => { active = false; timers.forEach(clearTimeout); };
  }, []);

  if (phase === "removed") return null;
  return (
      <div className="candle-loader" data-phase={phase} data-skip={skipped ? "" : undefined} onClick={skip} role="status" aria-live="polite" aria-label={`Բարի գալուստ գրադարան. ${VERSE_LINES.join(" ")} (${VERSE_REF})`} aria-hidden={phase === "hidden"}>
        <style>{styles}</style>
        <noscript><style>{".candle-loader{display:none!important}"}</style></noscript>
        <div className="candle-loader__scene" aria-hidden="true">
          <span className="candle-loader__light" />
          <span className="candle-loader__glow" />
          <span className="candle-loader__spark" />
          <p className="candle-loader__verse">
            {VERSE.map((line, lineIndex) => (
              <span key={lineIndex} className="candle-loader__line">
                {line.map((word, wordIndex) => (
                  <span key={wordIndex}>
                    {wordIndex > 0 && " "}
                    <span className="candle-loader__word">
                      {word.map(({ letter, delay }, letterIndex) => (
                        <span key={letterIndex} className="candle-loader__letter" style={{ animationDelay: `${delay}ms` }}>{letter}</span>
                      ))}
                    </span>
                  </span>
                ))}
              </span>
            ))}
            <span className="candle-loader__ref" style={{ animationDelay: `${LAST_LETTER_DELAY}ms` }}>{VERSE_REF}</span>
          </p>
          <span className="candle-loader__dawn" />
          <svg className="candle-loader__flame" viewBox="0 0 18 34">
            <defs>
              <radialGradient id="candle-flame" cx="50%" cy="72%" r="60%">
                <stop offset="0%" stopColor="#fffbe8" />
                <stop offset="35%" stopColor="#ffd56b" />
                <stop offset="75%" stopColor="#ff9a2e" />
                <stop offset="100%" stopColor="#e2611a" stopOpacity="0" />
              </radialGradient>
            </defs>
            <path d="M9 1C11 9 17 14 17 22a8 8 0 0 1-16 0C1 14 7 9 9 1Z" fill="url(#candle-flame)" />
            <ellipse cx="9" cy="25" rx="2.4" ry="4" fill="#7fb4ff" opacity=".45" />
          </svg>
          <svg style={{ position: "absolute", left: "50%", top: 74, marginLeft: -22 }} width="44" height="90" viewBox="0 0 44 90">
            <defs>
              <linearGradient id="candle-wax" x1="0" x2="1">
                <stop offset="0%" stopColor="#d9c39a" />
                <stop offset="45%" stopColor="#fbf1dc" />
                <stop offset="100%" stopColor="#cdb38a" />
              </linearGradient>
            </defs>
            <line x1="22" y1="0" x2="22" y2="8" stroke="#3a2a1a" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M6 10c4-2 28-2 32 0v76a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4Z" fill="url(#candle-wax)" />
            <path d="M6 10c4 2 28 2 32 0" fill="none" stroke="#efdcb6" strokeWidth="1.2" />
            <path d="M13 12c0 6-1 9 1 12" fill="none" stroke="#f4e6c8" strokeWidth="2" strokeLinecap="round" opacity=".8" />
            <rect x="6" y="62" width="32" height="5" fill="#b48a3e" opacity=".55" />
            <path d="M6 10 L6 86 a4 4 0 0 0 4 4 L14 90 L14 12 Z" fill="#000" opacity=".28" />
          </svg>
        </div>
      </div>
  );
}

function markSeen() {
  try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* Storage may be blocked. */ }
  try { localStorage.setItem(DAY_KEY, yerevanDay()); } catch { /* Storage may be blocked. */ }
}
