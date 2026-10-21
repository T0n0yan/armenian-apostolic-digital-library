import { Link } from "react-router";

import type { Route } from "./+types/about";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { seoMeta } from "../utils/seo";

export function meta({}: Route.MetaArgs) {
  return seoMeta({
    title: "Մեր մասին — Հոգևոր ժառանգություն",
    description: "«Հոգևոր ժառանգություն»-ը անկախ թվային գրադարան է՝ նվիրված Հայաստանյայց Առաքելական Սուրբ Եկեղեցու հոգևոր ժառանգությանը։ Եկեղեցու պաշտոնական կայքը չէ։",
    path: "/mer-masin",
  });
}

const panel = "frosted-panel grid gap-2.5 px-5 py-4 text-[14.5px] leading-[1.75] text-ink";
const heading = "m-0 font-noto text-[17px] font-semibold text-gold-bright";

/** Who makes the library and what it is (and is not). */
export default function About() {
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/" backLabel="Գրադարան" title="Մեր մասին" description="Անկախ թվային գրադարան" />
      <article className="mt-4 grid gap-4">
        <section className={panel}>
          <p className="m-0">
            «Հոգևոր ժառանգություն»-ը թվային գրադարան է՝ նվիրված Հայաստանյայց Առաքելական Սուրբ Եկեղեցու հոգևոր ժառանգությանը։
            Այստեղ մեկ տեղում են աղոթքներ, սաղմոսներ՝ ձայնագրությամբ, սրբերի վարքեր, Ավետարանի ուսուցում, օրվա ընթերցումներ և հարցեր Աստվածաշնչից։
          </p>
        </section>
        <section className={panel}>
          <h2 className={heading}>Անկախ նախաձեռնություն</h2>
          <p className="m-0">
            Սա <strong>անկախ, մասնավոր նախաձեռնություն է</strong> և Հայաստանյայց Առաքելական Սուրբ Եկեղեցու պաշտոնական կայքը չէ։
            Եկեղեցու պաշտոնական տեղեկությունների համար այցելեք Մայր Աթոռ Սուրբ Էջմիածնի կայքը՝{" "}
            <a className="text-gold-bright" href="https://www.armenianchurch.am" target="_blank" rel="noreferrer">armenianchurch.am</a>։
          </p>
        </section>
        <section className={panel}>
          <h2 className={heading}>Որտեղից են նյութերը</h2>
          <p className="m-0">
            Նյութերը հրապարակվում են մեր Telegram խմբում՝{" "}
            <a className="text-gold-bright" href="https://t.me/armenian_apostolic_church" target="_blank" rel="noreferrer">Հայ Առաքելական Սուրբ Եկեղեցի</a>, և ավտոմատ հայտնվում են այստեղ։
            Աստվածաշնչյան տեքստերը վերցված են Հայաստանյայց Առաքելական Եկեղեցու կողմից ընդունված թարգմանություններից, իսկ սաղմոսների համարակալումը՝ ըստ Յոթանասնից թարգմանության։
            Ամեն նյութի էջում կա հղում դեպի սկզբնական գրառումը։
          </p>
        </section>
        <section className={panel}>
          <h2 className={heading}>Ինչպես օգտվել</h2>
          <p className="m-0">
            Գրադարանը բաց է բոլորի համար, անվճար և առանց գովազդի։ Մուտք գործելով (Telegram-ով կամ Google-ով) կարող եք պահել նյութեր, դնել հիշեցումներ և նշել կարդացածը։
            Օգտագործելիս խնդրում ենք նշել աղբյուրը։
          </p>
          <p className="m-0">
            Հարցերի, առաջարկների կամ սխալի մասին հաղորդելու համար՝ <Link className="text-gold-bright" to="/kap">Կապ</Link>։
          </p>
        </section>
      </article>
    </PageShell>
  );
}
