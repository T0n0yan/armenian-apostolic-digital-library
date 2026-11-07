import { deviceKind, openLocationSettings, type DeviceKind, type LocationFailure } from "../utils/my-location";

const FAILURES: Record<LocationFailure, string> = {
  denied: "Տեղորոշման թույլտվություն չկա։",
  unavailable: "Ձեր հեռախոսի տեղորոշումը (GPS) անջատված է կամ տեղը չհաջողվեց որոշել։",
  unsupported: "Այս բրաուզերը չի կարող որոշել ձեր տեղը։ Բացեք կայքը Chrome-ով կամ Safari-ով։",
};

/**
 * Ինչպես միացնել տեղորոշումը՝ ըստ սարքի։ iPhone-ում կայքը չի կարող նորից հարցնել, եթե մեկ անգամ
 * մերժվել է կամ Safari-ում «Մերժել» է դրված. մարդը պետք է ինքը փոխի կարգավորումը։
 */
const STEPS: Record<DeviceKind, Record<"denied" | "unavailable", string[]>> = {
  telegram: {
    denied: ["Սեղմեք «Բացել կարգավորումները» ներքևում", "Միացրեք «Տեղորոշում» (Location)", "Վերադարձեք և սեղմեք «Փորձել կրկին»"],
    unavailable: ["Հեռախոսի վերևի արագ մենյուից միացրեք «Տեղորոշում» (Location / GPS)", "Telegram-ի կարգավորումներում թույլատրեք տեղորոշումը", "Սեղմեք «Փորձել կրկին»"],
  },
  ios: {
    denied: [
      "Բացեք «Կարգավորումներ» (Settings) → «Գաղտնիություն և անվտանգություն» (Privacy & Security) → «Տեղորոշում» (Location Services). այն պետք է միացված լինի",
      "Նույն ցանկում գտեք «Safari-ի կայքեր» (Safari Websites) → ընտրեք «Հարցնել հաջորդ անգամ» (Ask Next Time) կամ «Հավելվածն օգտագործելիս» (While Using)",
      "«Կարգավորումներ» → «Հավելվածներ» (Apps) → «Safari» → «Տեղորոշում» (Location) → «Հարցնել» (Ask) կամ «Թույլատրել» (Allow)",
      "Chrome-ով բացելիս՝ «Կարգավորումներ» → «Chrome» → «Տեղորոշում» → «Հավելվածն օգտագործելիս»",
      "Ամբողջությամբ փակեք կայքը (կամ էկրանին ավելացված պատկերակը), բացեք նորից և սեղմեք «Փորձել կրկին»",
    ],
    unavailable: ["«Կարգավորումներ» → «Գաղտնիություն և անվտանգություն» → «Տեղորոշում» (Location Services)՝ միացնել", "Վերադարձեք և սեղմեք «Փորձել կրկին»"],
  },
  android: {
    denied: ["Հասցեի տողի ձախ կողմում սեղմեք 🔒 (կամ ⓘ) նշանը", "«Թույլտվություններ» → «Տեղորոշում» → «Թույլատրել»", "Սեղմեք «Փորձել կրկին»"],
    unavailable: ["Հեռախոսի վերևի արագ մենյուից միացրեք «Տեղորոշում» (Location)", "Սեղմեք «Փորձել կրկին»"],
  },
  desktop: {
    denied: ["Հասցեի տողի ձախ կողմում սեղմեք 🔒 նշանը", "«Տեղորոշում» (Location) → «Թույլատրել»", "Սեղմեք «Փորձել կրկին»"],
    unavailable: ["Համակարգչի կարգավորումներում միացրեք տեղորոշումը", "Սեղմեք «Փորձել կրկին»"],
  },
};

/** Տեղորոշումը չստացվեց. ինչու, ինչպես միացնել, «Բացել կարգավորումները» (Telegram) և «Փորձել կրկին»։ */
export function LocationHelp({ failure, lead, onRetry }: { failure: LocationFailure; lead?: string; onRetry: () => void }) {
  const kind = deviceKind();
  return (
    <div className="grid gap-2 rounded-[14px] border border-[rgb(184_72_62/45%)] bg-[rgb(184_72_62/10%)] px-3.5 py-3 text-[13px] leading-relaxed text-ink" role="alert">
      <strong className="text-[#c4574b]">{FAILURES[failure]}{lead ? ` ${lead}` : ""}</strong>
      {failure !== "unsupported" ? (
        <ol className="m-0 grid gap-1 pl-5 text-[12.5px] text-muted">
          {STEPS[kind][failure].map((step) => <li key={step}>{step}</li>)}
        </ol>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {kind === "telegram" ? <button type="button" className="min-h-9 cursor-pointer rounded-[11px] border border-glass-border bg-subtle px-3 text-[12.5px] font-semibold text-gold-bright" onClick={() => openLocationSettings()}>Բացել կարգավորումները</button> : null}
        <button type="button" className="min-h-9 cursor-pointer rounded-[11px] border-0 bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] px-3 text-[12.5px] font-bold text-[#2a1708]" onClick={onRetry}>Փորձել կրկին</button>
      </div>
    </div>
  );
}
