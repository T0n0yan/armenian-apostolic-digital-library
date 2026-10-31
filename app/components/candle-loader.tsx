import { useEffect, useState } from "react";

// Intro on the first visit of a session: the unlit candle (0.7 s), a spark and the flame catching
// (~0.9 s), then the light settles and welcomes the reader before the page opens (3.6 s at least,
// so it is felt even on fast connections), and finally the light swells from the flame over the
// whole screen and lifts to show the page. The page keeps loading underneath meanwhile.
const LIGHT_AT_MS = 700;
const MINIMUM_VISIBLE_MS = 3_600;
const EXIT_MS = 2_000;
const SESSION_KEY = "library-loader-seen-v4";

type Phase = "unlit" | "lit" | "hidden" | "removed";

const styles = `
html[data-intro-seen] .candle-loader{display:none}
html:not([data-intro-seen]):has(.candle-loader:not([data-phase="hidden"])){overflow:hidden}
.candle-loader{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;overflow:hidden;background:#07040a;transition:opacity .8s ease 1.1s}
.candle-loader[data-phase="hidden"]{opacity:0;pointer-events:none}
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
.candle-loader__scene{position:relative;width:120px;height:170px;transform:scale(.9)}
/* On tall phones the eye's centre sits above the geometric one. */
@media(max-aspect-ratio:10/17){.candle-loader__scene{margin-bottom:min(12svh,110px)}}
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

  useEffect(() => {
    let active = true;
    const timers: number[] = [];
    const later = (callback: () => void, ms: number) => { timers.push(window.setTimeout(() => active && callback(), ms)); };
    let seen = false;
    try { seen = sessionStorage.getItem(SESSION_KEY) === "1"; } catch { /* Storage may be blocked. */ }
    if (seen) {
      // Later visits skip the intro; the light-flood exit is only for the first one.
      setPhase("removed");
      return () => { active = false; timers.forEach(clearTimeout); };
    }
    setPhase("unlit");
    later(() => setPhase("lit"), LIGHT_AT_MS);
    // Intro only: fonts, images and network requests never prolong it.
    later(() => {
      try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* Storage may be blocked. */ }
      setPhase("hidden");
      later(() => setPhase("removed"), EXIT_MS);
    }, MINIMUM_VISIBLE_MS);
    return () => { active = false; timers.forEach(clearTimeout); };
  }, []);

  if (phase === "removed") return null;
  return (
      <div className="candle-loader" data-phase={phase} role="status" aria-live="polite" aria-label="Բարի գալուստ գրադարան" aria-hidden={phase === "hidden"}>
        <style>{styles}</style>
        <noscript><style>{".candle-loader{display:none!important}"}</style></noscript>
        <div className="candle-loader__scene" aria-hidden="true">
          <span className="candle-loader__light" />
          <span className="candle-loader__glow" />
          <span className="candle-loader__spark" />
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