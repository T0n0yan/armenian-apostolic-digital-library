import { CalendarHeart, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { monthToShow, yearToShow } from "../utils/liturgy";

const MONTHS = ["Հունվար", "Փետրվար", "Մարտ", "Ապրիլ", "Մայիս", "Հունիս", "Հուլիս", "Օգոստոս", "Սեպտեմբեր", "Հոկտեմբեր", "Նոյեմբեր", "Դեկտեմբեր"];

/**
 * «Իմ անկյունը»-ում. միշտ՝ «Իմ տարին» հղումը, ամսվա առաջին 7 օրը՝ նախորդ ամսվա քարտը,
 * իսկ դեկտեմբերի 31-ից հունվարի 15-ը՝ տարվա ամփոփման քարտը։ Ժամը վերցվում է հեռախոսից։
 */
export function MyYearLinks() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  const month = now ? monthToShow(now) : null;
  const year = now ? yearToShow(now) : null;
  const card = "paper-card flex items-center gap-3 px-4 py-3 text-inherit no-underline";
  return (
    <div className="grid gap-2">
      {year ? (
        <Link className={`${card} border border-[rgb(217_181_111/55%)]`} to={`/my-year?period=${year}`}>
          <Sparkles aria-hidden="true" size={22} className="shrink-0 text-gold-bright" />
          <span className="grid gap-0.5"><strong className="text-[15px] text-ink">Ձեր {year} թվականը</strong><span className="text-[12.5px] text-muted">Պատարագներ, Հաղորդություններ, կարդացածներ</span></span>
        </Link>
      ) : null}
      {month ? (
        <Link className={card} to={`/my-year?period=${month}`}>
          <CalendarHeart aria-hidden="true" size={20} className="shrink-0 text-gold" />
          <span className="grid gap-0.5"><strong className="text-[14.5px] text-ink">{MONTHS[Number(month.slice(5)) - 1]}</strong><span className="text-[12.5px] text-muted">Ամսվա ամփոփումը</span></span>
        </Link>
      ) : null}
      {!year ? (
        <Link className={card} to="/my-year">
          <Sparkles aria-hidden="true" size={20} className="shrink-0 text-gold" />
          <span className="grid gap-0.5"><strong className="text-[14.5px] text-ink">Իմ տարին</strong><span className="text-[12.5px] text-muted">Պատարագներ, Հաղորդություններ, կարդացածներ</span></span>
        </Link>
      ) : null}
    </div>
  );
}
