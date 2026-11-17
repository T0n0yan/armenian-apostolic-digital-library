
/** Small Armenian cross for the affiliation seal. */
function ArmenianCross({size = 14}: { size?: number }) {
    return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v18M6 9h12"/>
        <path d="M12 3c-1.2 0-1.8.8-1.8 1.6M12 3c1.2 0 1.8.8 1.8 1.6M6 9c0-1.2-.8-1.8-1.6-1.8M6 9c0 1.2-.8 1.8-1.6 1.8M18 9c0-1.2.8-1.8 1.6-1.8M18 9c0 1.2.8 1.8 1.6 1.8M12 21c-1.2 0-1.8-.8-1.8-1.6M12 21c1.2 0 1.8-.8 1.8-1.6"/>
    </svg>);
}

export function HomeTitle() {
    return (<header className="relative z-5 -mt-[6px] grid justify-items-center px-2 pt-[32px] pb-0 text-center">
        {/* Տեսանելի վերնագիր չկա (տիրոջ որոշում). h1-ը՝ միայն էկրանի ընթերցիչների և որոնման համար */}
        <h1 className="sr-only">Apostolic.am — Հայաստանյայց Առաքելական Եկեղեցուն նվիրված</h1>
        <p className="hero-rise hero-rise-delay m-0 grid max-w-full justify-items-center gap-0.5 rounded-card border border-[rgb(217_181_111/38%)] bg-[linear-gradient(180deg,rgb(217_181_111/14%),rgb(217_181_111/5%))] px-3 py-1.5 min-[380px]:px-4 text-center text-gold-bright shadow-[inset_0_1px_0_rgb(255_255_255/14%)]">
            <span className="inline-flex items-center gap-1 text-[clamp(10px,3.15vw,14px)] leading-snug font-semibold whitespace-nowrap min-[380px]:gap-1.5"><ArmenianCross size={12}/>Հայաստանյայց Առաքելական Եկեղեցուն<ArmenianCross size={12}/></span>
            <span className="text-[10.5px] font-semibold tracking-[2px] text-gold uppercase">նվիրված</span>
        </p>
    </header>);
}
