import { useEffect, useState } from "react";

const MAXIMUM_WAIT_MS = 8_000;
const MINIMUM_VISIBLE_MS = 1_400;
// The flame stays lit; the dark veil opens like dawn around it (a widening circle of light).
const FLAME_OUT_MS = 0;
const EXIT_MS = 1_100;
const SESSION_KEY = "library-loader-seen-v3";

type Phase = "lit" | "out" | "hidden" | "removed";

const styles = `
.candle-loader{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;overflow:hidden;background:#07040a;
  -webkit-mask:radial-gradient(circle at 50% 46%,transparent calc(var(--reveal,0%) - 18%),#000 var(--reveal,0%));
  mask:radial-gradient(circle at 50% 46%,transparent calc(var(--reveal,0%) - 18%),#000 var(--reveal,0%));
  transition:--reveal 1.1s cubic-bezier(.6,0,.2,1),opacity 1.1s ease}
.candle-loader[data-phase="hidden"]{--reveal:140%;opacity:0;pointer-events:none}
.candle-loader__scene{position:relative;width:120px;height:170px;transform:scale(.9)}
.candle-loader__light{position:absolute;left:50%;top:40px;width:520px;height:520px;margin:-260px 0 0 -260px;border-radius:50%;
  background:radial-gradient(circle,rgb(255 190 100/34%) 0%,rgb(255 150 60/14%) 22%,rgb(120 60 20/6%) 42%,transparent 62%);animation:candle-glow 3s ease-in-out infinite}
.candle-loader__glow{position:absolute;left:50%;top:22px;width:110px;height:110px;margin-left:-55px;border-radius:50%;background:radial-gradient(circle,rgb(255 214 140/55%),rgb(255 170 60/16%) 45%,transparent 70%);animation:candle-glow 2.4s ease-in-out infinite}
.candle-loader__flame{position:absolute;left:50%;top:44px;width:18px;height:34px;margin-left:-9px;transform-origin:50% 100%;animation:candle-flicker 1.4s ease-in-out infinite;filter:drop-shadow(0 0 6px rgb(255 190 90/80%))}
.candle-loader__caption{position:absolute;top:calc(100% + 18px);left:50%;translate:-50% 0;white-space:nowrap;font-family:var(--font-noto);font-size:13px;letter-spacing:.6px;color:#e9cf98;opacity:.8}
@media(prefers-reduced-motion:reduce){.candle-loader__flame,.candle-loader__glow,.candle-loader__light{animation:none}}
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
        <span className="candle-loader__light" />
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
        <span className="candle-loader__caption">Հոգևոր ժառանգություն</span>
      </div>
    </div>
  );
}
