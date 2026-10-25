import { Bot, Check, Landmark, LifeBuoy, Mail, MessagesSquare } from "lucide-react";
import { useEffect, useState } from "react";

import type { Route } from "./+types/contact";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { seoMeta } from "../utils/seo";

import { CONTACT_EMAIL, INFO_EMAIL, SUPPORT_EMAIL } from "../utils/contact";

export function meta({}: Route.MetaArgs) {
  return seoMeta({
    title: "Կապ — Հոգևոր ժառանգություն",
    description: "Հարցեր, առաջարկներ կամ նյութի սխալ. ինչպես կապվել «Հոգևոր ժառանգություն» գրադարանի հետ։",
    path: "/kap",
  });
}

const row = "flex items-center gap-3.5 frosted-panel px-4 py-3.5 text-inherit no-underline transition-transform active:scale-[.99]";
const icon = "grid size-10 shrink-0 place-items-center rounded-full bg-[rgb(217_181_111/14%)] text-gold-bright";

const emails = [
  { address: CONTACT_EMAIL, title: "Հարցեր և առաջարկներ", note: "համագործակցություն", Icon: Mail },
  { address: SUPPORT_EMAIL, title: "Տեխնիկական աջակցություն", note: "խնդիրներ և սխալներ", Icon: LifeBuoy },
  { address: INFO_EMAIL, title: "Պաշտոնական նամակներ", note: "ընդհանուր նամակագրություն", Icon: Landmark },
];

/** How to reach the library: e-mail, the bot, the Telegram group. */
export default function Contact() {
  // A mail link opens nothing when no mail program is set up (and inside Telegram), so it also
  // copies the address and says so.
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = (address: string) => {
    navigator.clipboard?.writeText(address).then(() => setCopied(address), () => undefined);
  };
  return (
    <PageShell>
      <SiteNav />
      <PageHeader showSearch={false} backTo="/" backLabel="Գրադարան" title="Կապ" />
      <div className="mt-4 grid gap-2.5">
        {emails.map(({ address, title, note, Icon }) => (
          <a key={address} className={row} href={`mailto:${address}`} onClick={() => copy(address)}>
            <span className={icon}><Icon aria-hidden="true" size={19} /></span>
            <span className="grid"><strong className="text-[14.5px] text-ink">{title}</strong><span className="text-[12.5px] text-muted">{copied === address ? <span className="inline-flex items-center gap-1 text-gold-bright"><Check aria-hidden="true" size={13} /> Հասցեն պատճենվեց</span> : <>{address} · {note}</>}</span></span>
          </a>
        ))}
        <a className={row} href="https://t.me/armenian_apostolic_church_bot" target="_blank" rel="noreferrer">
          <span className={icon}><Bot aria-hidden="true" size={19} /></span>
          <span className="grid"><strong className="text-[14.5px] text-ink">Telegram բոտ</strong><span className="text-[12.5px] text-muted">@armenian_apostolic_church_bot · գրեք /help</span></span>
        </a>
        <a className={row} href="https://t.me/armenian_apostolic_church" target="_blank" rel="noreferrer">
          <span className={icon}><MessagesSquare aria-hidden="true" size={19} /></span>
          <span className="grid"><strong className="text-[14.5px] text-ink">Telegram խումբ</strong><span className="text-[12.5px] text-muted">Հայ Առաքելական Սուրբ Եկեղեցի</span></span>
        </a>
        <p className="m-0 mt-2 px-1 text-[12.5px] leading-snug text-muted">
          Նյութում սխալ նկատելիս գրեք {SUPPORT_EMAIL} հասցեին՝ նյութի հղումով և նշելով, թե ինչն է սխալ. կուղղենք որքան հնարավոր է շուտ։
        </p>
      </div>
    </PageShell>
  );
}
