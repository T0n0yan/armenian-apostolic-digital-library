import { useEffect, useState } from "react";

import ArmenianEternity from "../assets/armenian-eternity.svg";
import OliveWreath from "../assets/crown-olive-wreath.webp";

const MAXIMUM_WAIT_MS = 5_000;
const MINIMUM_VISIBLE_MS = 650;
const EXIT_MS = 420;
const SESSION_KEY = "library-loader-seen-v2";

const styles = `
.brand-loader{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:radial-gradient(circle at 50% 44%,rgb(102 64 66/18%),transparent 32%),var(--page);transition:opacity .42s ease,visibility .42s;overflow:hidden}
.brand-loader[aria-hidden="true"]{opacity:0;visibility:hidden;pointer-events:none}
.brand-loader__mark{position:relative;display:grid;width:108px;height:108px;place-items:center}
.brand-loader__wreath{position:absolute;width:106px;height:106px;object-fit:contain;opacity:.72;animation:brand-breathe 2.8s ease-in-out infinite}
.brand-loader__eternity{position:relative;width:38px;height:38px;object-fit:contain;filter:var(--eternity-filter);animation:brand-turn 8s linear infinite}
.brand-loader__line{position:absolute;top:calc(100% + 22px);left:50%;width:96px;height:1px;translate:-50% 0;overflow:hidden;background:rgb(217 181 111/16%)}
.brand-loader__line::after{content:"";display:block;width:38%;height:100%;background:linear-gradient(90deg,transparent,var(--gold-bright),transparent);animation:brand-line 1.5s ease-in-out infinite}
@keyframes brand-breathe{0%,100%{scale:.98;opacity:.62}50%{scale:1.035;opacity:.88}}
@keyframes brand-turn{to{rotate:360deg}}
@keyframes brand-line{0%{translate:-110% 0}100%{translate:360% 0}}
@media(prefers-reduced-motion:reduce){.brand-loader__wreath,.brand-loader__eternity,.brand-loader__line::after{animation:none}}
`;

export function CandleLoader() {
  const [hidden, setHidden] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    let active = true;
    const startedAt = performance.now();
    const seen = sessionStorage.getItem(SESSION_KEY) === "1";
    const ready = Promise.race([
      document.fonts?.ready ?? Promise.resolve(),
      new Promise<void>((resolve) => window.setTimeout(resolve, MAXIMUM_WAIT_MS)),
    ]);
    void ready.then(() => {
      const wait = seen ? 0 : Math.max(0, MINIMUM_VISIBLE_MS - (performance.now() - startedAt));
      window.setTimeout(() => {
        if (!active) return;
        sessionStorage.setItem(SESSION_KEY, "1");
        setHidden(true);
        window.setTimeout(() => active && setRemoved(true), EXIT_MS);
      }, wait);
    });
    return () => { active = false; };
  }, []);

  if (removed) return null;
  return (
    <div className="brand-loader" role="status" aria-live="polite" aria-label="Գրադարանը բեռնվում է" aria-hidden={hidden}>
      <style>{styles}</style>
      <div className="brand-loader__mark" aria-hidden="true">
        <img className="brand-loader__wreath" src={OliveWreath} alt="" width={256} height={256} />
        <img className="brand-loader__eternity" src={ArmenianEternity} alt="" width={48} height={48} />
        <span className="brand-loader__line" />
      </div>
    </div>
  );
}
