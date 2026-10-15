import {useEffect, useRef, useState} from "react";
import type {CSSProperties} from "react";

const MAXIMUM_WAIT_MS = 12_000;
const MINIMUM_VISIBLE_MS = 1_200;
const EXIT_ANIMATION_MS = 600;

const styles = `
.candle-loader{--cl-bg:#120b08;--cl-bg-glow:#2a1608;--cl-wax:#f3e6cf;--cl-wax-shade:#d9c3a0;--cl-flame-core:#fff6d6;--cl-flame-mid:#ffc247;--cl-flame-out:#ff7a1a;--cl-spark:#ffd27a;--cl-scale:clamp(.52,calc(.48 + 1.25vw),.66);position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 55%,var(--cl-bg-glow) 0%,var(--cl-bg) 62%);transition:opacity .6s ease,visibility .6s;overflow:hidden}
.candle-loader--hidden{opacity:0;visibility:hidden;pointer-events:none}
.candle-loader__candle{position:relative;width:64px;height:230px;margin-top:clamp(38px,5vw,60px);transform:scale(var(--cl-scale));transform-origin:50% 50%}
.candle-loader__glow{position:absolute;left:50%;top:-70px;width:340px;height:340px;translate:-50% 0;background:radial-gradient(circle,rgba(255,170,60,.38) 0%,rgba(255,120,30,.14) 40%,transparent 70%);border-radius:50%;animation:cl-glow 3.2s ease-in-out infinite;pointer-events:none}
.candle-loader__wax{position:absolute;bottom:0;left:0;width:100%;height:100%;border-radius:8px 8px 10px 10px;background:linear-gradient(90deg,var(--cl-wax-shade) 0%,var(--cl-wax) 35%,#fff4e0 55%,var(--cl-wax-shade) 100%);box-shadow:0 0 40px rgba(255,150,50,.18),inset 0 -14px 18px rgba(0,0,0,.12);overflow:hidden}
.candle-loader__wax::before{content:"";position:absolute;top:0;left:0;right:0;height:14px;background:radial-gradient(ellipse at 50% 100%,#ffe7b0 0%,#f6dba8 60%,transparent 100%);opacity:.9}
.candle-loader__drip{position:absolute;top:6px;width:9px;border-radius:0 0 9px 9px;background:linear-gradient(90deg,#efdcb8,#fff2d8);transform-origin:top;animation:cl-drip 7s ease-in-out infinite}
.candle-loader__drip--one{left:10px;height:34px}
.candle-loader__drip--two{left:42px;height:20px;animation-delay:-3.5s}
.candle-loader__wick{position:absolute;left:50%;top:-16px;width:3px;height:18px;translate:-50% 0;background:linear-gradient(#222,#050505);border-radius:2px;z-index:2}
.candle-loader__flame-wrap{position:absolute;left:50%;top:-78px;width:36px;height:68px;translate:-50% 0;transform-origin:50% 100%;animation:cl-sway 2.4s ease-in-out infinite;z-index:3}
.candle-loader__flame{position:absolute;inset:0;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;background:radial-gradient(ellipse at 50% 75%,var(--cl-flame-core) 0%,var(--cl-flame-mid) 42%,var(--cl-flame-out) 78%,transparent 100%);filter:blur(1px) drop-shadow(0 0 16px rgba(255,150,40,.9));animation:cl-flicker .9s ease-in-out infinite alternate;transform-origin:50% 100%}
.candle-loader__flame::after{content:"";position:absolute;left:50%;bottom:3px;width:10px;height:18px;translate:-50% 0;border-radius:50%;background:radial-gradient(ellipse,rgba(110,150,255,.75),transparent 70%)}
.candle-loader__sparks{position:absolute;left:50%;top:-60px;width:0;height:0;z-index:1;pointer-events:none}
.candle-loader__spark{position:absolute;top:0;width:var(--spark-size,3px);height:var(--spark-size,3px);border-radius:50%;background:var(--cl-spark);box-shadow:0 0 8px 2px rgba(255,190,80,.85);opacity:0;animation:cl-rise var(--spark-duration,4s) ease-out forwards}
@keyframes cl-glow{0%,100%{opacity:.85;scale:1}35%{opacity:1;scale:1.06}70%{opacity:.75;scale:.96}}
@keyframes cl-drip{0%{scale:1 0;opacity:0}15%{opacity:1}60%{scale:1 1;opacity:1}100%{scale:1 1;opacity:0}}
@keyframes cl-flicker{0%{scale:1 1;rotate:-1.5deg}25%{scale:.94 1.06;rotate:1deg}50%{scale:1.04 .95;rotate:-.5deg}75%{scale:.96 1.08;rotate:1.5deg}100%{scale:1.02 1;rotate:-1deg}}
@keyframes cl-sway{0%,100%{rotate:-2deg}50%{rotate:2.5deg}}
@keyframes cl-rise{0%{transform:translate(0,0) scale(1);opacity:0}12%{opacity:1}100%{transform:translate(var(--spark-x,0),var(--spark-y,-160px)) scale(.2);opacity:0}}
@media(prefers-reduced-motion:reduce){.candle-loader__flame-wrap,.candle-loader__glow,.candle-loader__drip{animation-duration:8s}.candle-loader__flame{animation-duration:3s}.candle-loader__spark{display:none}}
`;

function waitForInitialAssets() {
    const images = Array.from(document.images);
    const imagePromises = images.map(async (image) => {
        if (!image.complete) {
            await new Promise<void>((resolve) => {
                image.addEventListener("load", () => resolve(), {once: true});
                image.addEventListener("error", () => resolve(), {once: true});
            });
        }
        if (image.decode) await image.decode().catch(() => undefined);
    });

    return Promise.allSettled([
        ...imagePromises,
        document.fonts?.ready ?? Promise.resolve(),
    ]);
}

function randomBetween(minimum: number, maximum: number) {
    return Math.random() * (maximum - minimum) + minimum;
}

type CandleLoaderProps = {
    /** Candle body width in pixels. Omit for the responsive 33–42px default. */
    size?: number;
};

type LoaderStyle = CSSProperties & {"--cl-scale"?: number};

export function CandleLoader({size}: CandleLoaderProps) {
    const [isHidden, setIsHidden] = useState(false);
    const sparksRef = useRef<HTMLDivElement>(null);
    const loaderStyle: LoaderStyle | undefined = size === undefined
        ? undefined
        : {"--cl-scale": Math.max(20, Math.min(size, 96)) / 64};

    useEffect(() => {
        let active = true;
        const startedAt = performance.now();
        const previousOverflow = document.body.style.overflow;
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.body.style.overflow = "hidden";

        const createSpark = () => {
            if (reduceMotion || document.hidden || !sparksRef.current) return;
            const spark = document.createElement("span");
            spark.className = "candle-loader__spark";
            spark.style.setProperty("--spark-size", `${randomBetween(2, 4.5).toFixed(1)}px`);
            spark.style.setProperty("--spark-x", `${randomBetween(-60, 60).toFixed(0)}px`);
            spark.style.setProperty("--spark-y", `${-randomBetween(110, 230).toFixed(0)}px`);
            spark.style.setProperty("--spark-duration", `${randomBetween(2.8, 5).toFixed(2)}s`);
            spark.style.left = `${randomBetween(-8, 8).toFixed(0)}px`;
            sparksRef.current.appendChild(spark);
            spark.addEventListener("animationend", () => spark.remove(), {once: true});
        };

        const sparkTimer = window.setInterval(createSpark, 380);
        const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, MAXIMUM_WAIT_MS));
        const ready = new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                void waitForInitialAssets().then(() => resolve());
            }));
        });

        void Promise.race([ready, timeout]).then(() => {
            const remaining = Math.max(0, MINIMUM_VISIBLE_MS - (performance.now() - startedAt));
            window.setTimeout(() => {
                if (!active) return;
                setIsHidden(true);
                window.setTimeout(() => {
                    if (!active) return;
                    window.clearInterval(sparkTimer);
                    sparksRef.current?.replaceChildren();
                    document.body.style.overflow = previousOverflow;
                }, EXIT_ANIMATION_MS);
            }, remaining);
        });

        return () => {
            active = false;
            window.clearInterval(sparkTimer);
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    return (
        <div
            className={`candle-loader${isHidden ? " candle-loader--hidden" : ""}`}
            role="status"
            aria-live="polite"
            aria-label="Կայքը բեռնվում է"
            style={loaderStyle}
        >
            <style>{styles}</style>
            <div className="candle-loader__candle" aria-hidden="true">
                <div className="candle-loader__glow"/>
                <div className="candle-loader__sparks" ref={sparksRef}/>
                <div className="candle-loader__flame-wrap">
                    <div className="candle-loader__flame"/>
                </div>
                <div className="candle-loader__wick"/>
                <div className="candle-loader__wax">
                    <span className="candle-loader__drip candle-loader__drip--one"/>
                    <span className="candle-loader__drip candle-loader__drip--two"/>
                </div>
            </div>
        </div>
    );
}
