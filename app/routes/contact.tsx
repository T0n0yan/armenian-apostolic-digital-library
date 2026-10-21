import { Bot, Mail, MessagesSquare, Send } from "lucide-react";

import type { Route } from "./+types/contact";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { seoMeta } from "../utils/seo";

import { CONTACT_EMAIL } from "../utils/contact";

export function meta({}: Route.MetaArgs) {
  return seoMeta({
    title: "Կապ — Հոգևոր ժառանգություն",
    description: "Հարցեր, առաջարկներ կամ նյութի սխալ. ինչպես կապվել «Հոգևոր ժառանգություն» գրադարանի հետ։",
    path: "/kap",
  });
}

const row = "flex items-center gap-3.5 frosted-panel px-4 py-3.5 text-inherit no-underline transition-transform active:scale-[.99]";
const icon = "grid size-10 shrink-0 place-items-center rounded-full bg-[rgb(217_181_111/14%)] text-gold-bright";

/** How to reach the library: e-mail, the bot, the Telegram group. */
export default function Contact() {
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/" backLabel="Գրադարան" title="Կապ" description="Հարցեր, առաջարկներ, նյութի սխալներ" />
      <div className="mt-4 grid gap-2.5">
        <a className={row} href={`mailto:${CONTACT_EMAIL}`}>
          <span className={icon}><Mail aria-hidden="true" size={19} /></span>
          <span className="grid"><strong className="text-[14.5px] text-ink">Էլ. փոստ</strong><span className="text-[12.5px] text-muted">{CONTACT_EMAIL}</span></span>
        </a>
        <a className={row} href="https://t.me/armenian_apostolic_church_bot" target="_blank" rel="noreferrer">
          <span className={icon}><Bot aria-hidden="true" size={19} /></span>
          <span className="grid"><strong className="text-[14.5px] text-ink">Telegram բոտ</strong><span className="text-[12.5px] text-muted">@armenian_apostolic_church_bot · գրեք /help</span></span>
        </a>
        <a className={row} href="https://t.me/armenian_apostolic_church" target="_blank" rel="noreferrer">
          <span className={icon}><MessagesSquare aria-hidden="true" size={19} /></span>
          <span className="grid"><strong className="text-[14.5px] text-ink">Telegram խումբ</strong><span className="text-[12.5px] text-muted">Հայ Առաքելական Սուրբ Եկեղեցի</span></span>
        </a>
        <p className="m-0 mt-2 flex items-start gap-2 px-1 text-[12.5px] leading-snug text-muted">
          <Send aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-gold" />
          Նյութում սխալ նկատելիս գրեք նյութի հղումը և ինչն է սխալ. կուղղենք որքան հնարավոր է շուտ։
        </p>
      </div>
    </PageShell>
  );
}
