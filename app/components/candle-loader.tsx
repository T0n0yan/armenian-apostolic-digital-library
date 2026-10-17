import { useEffect, useState } from "react";

const MAXIMUM_WAIT_MS = 8_000;
const MINIMUM_VISIBLE_MS = 1_200;
// Flame flickers down (~0.9 s) while smoke rises (~1.6 s); the page fades in after the smoke.
const FLAME_OUT_MS = 1_700;
const EXIT_MS = 650;
const SESSION_KEY = "library-loader-seen-v3";

type Phase = "lit" | "out" | "hidden" | "removed";

const styles = `
.candle-loader{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:radial-gradient(circle at 50% 46%,rgb(240 190 100/16%),transparent 34%),var(--page-bg);transition:opacity .65s ease,visibility .65s;overflow:hidden}
.candle-loader[data-phase="hidden"]{opacity:0;visibility:hidden;pointer-events:none}
.candle-loader__scene{position:relative;width:120px;height:170px;transform:scale(1.4)}
.candle-loader__glow{position:absolute;left:50%;top:18px;width:120px;height:120px;margin-left:-60px;border-radius:50%;background:radial-gradient(circle,rgb(255 196 96/45%),rgb(255 170 60/12%) 45%,transparent 70%);animation:candle-glow 2.6s ease-in-out infinite;transition:opacity .5s ease}
.candle-loader__flame{position:absolute;left:50%;top:44px;width:18px;height:34px;margin-left:-9px;transform-origin:50% 100%;animation:candle-flicker 1.4s ease-in-out infinite}
.candle-loader__smoke{position:absolute;left:50%;top:50px;width:14px;height:34px;margin-left:-7px;border-radius:50%;background:radial-gradient(ellipse,rgb(150 140 130/70%),transparent 72%);opacity:0;filter:blur(2.5px)}
.candle-loader[data-phase="out"] .candle-loader__flame{animation:candle-out .9s cubic-bezier(.5,0,.75,0) forwards}
.candle-loader[data-phase="out"] .candle-loader__glow{opacity:0;transition:opacity .9s ease}
.candle-loader[data-phase="out"] .candle-loader__smoke{animation:candle-smoke 1.6s ease-out .55s forwards}
.candle-loader[data-phase="out"] .candle-loader__smoke:nth-child(4){animation-delay:.75s;left:46%}
.candle-loader[data-phase="out"] .candle-loader__smoke:nth-child(5){animation-delay:.95s;left:54%}
.candle-loader__caption{position:absolute;top:calc(100% + 10px);left:50%;translate:-50% 0;white-space:nowrap;font-family:var(--font-noto);font-size:13px;letter-spacing:.4px;color:var(--gold-bright);opacity:.85}
@media(prefers-reduced-motion:reduce){.candle-loader__flame,.candle-loader__glow{animation:none}}
`;

/**
 * First-visit loader: a lit candle that is gently put out (with a wisp of smoke) once the page is
 * ready. Later navigations in the same session skip it.
 */
export function CandleLoader() {
  const [phase, setPhase] = useState<Phase>("lit");

  useEffect(() => {
    let active = true;
    const timers: number[] = [];
    const later = (callback: () => void, ms: number) => { timers.push(window.setTimeout(() => active && callback(), ms)); };
    let seen = false;
    try { seen = sessionStorage.getItem(SESSION_KEY) === "1"; } catch { /* Storage may be blocked. */ }
    if (seen) {
      setPhase("hidden");
      later(() => setPhase("removed"), EXIT_MS);
      return () => { active = false; timers.forEach(clearTimeout); };
    }
    const startedAt = performance.now();
    // Reveal the page only once fonts and every image are loaded, so nothing pops in afterwards.
    const pageLoaded = document.readyState === "complete"
      ? Promise.resolve()
      : new Promise<void>((resolve) => window.addEventListener("load", () => resolve(), { once: true }));
    const ready = Promise.race([
      Promise.all([document.fonts?.ready ?? Promise.resolve(), pageLoaded]),
      new Promise<void>((resolve) => window.setTimeout(resolve, MAXIMUM_WAIT_MS)),
    ]);
    void ready.then(() => {
      later(() => {
        try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* Storage may be blocked. */ }
        setPhase("out");
        later(() => {
          setPhase("hidden");
          later(() => setPhase("removed"), EXIT_MS);
        }, FLAME_OUT_MS);
      }, Math.max(0, MINIMUM_VISIBLE_MS - (performance.now() - startedAt)));
    });
    return () => { active = false; timers.forEach(clearTimeout); };
  }, []);

  if (phase === "removed") return null;
  return (
    <div className="candle-loader" data-phase={phase} role="status" aria-live="polite" aria-label="Գրադարանը բեռնվում է" aria-hidden={phase === "hidden"}>
      <style>{styles}</style>
      <div className="candle-loader__scene" aria-hidden="true">
        <span className="candle-loader__glow" />
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
        <span className="candle-loader__smoke" />
        <span className="candle-loader__smoke" />
        <span className="candle-loader__smoke" />
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
        </svg>
        <span className="candle-loader__caption">Հոգևոր ժառանգություն</span>
      </div>
    </div>
  );
}
