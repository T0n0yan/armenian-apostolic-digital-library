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
      <PageHeader showSearch={false} backTo="/" backLabel="Գրադարան" title="Մեր մասին" />
      <article className="mt-4 grid gap-4">
        <section className={panel}>
          <h2 className={heading}>Ինչ է «Հոգևոր ժառանգություն»-ը</h2>
          <p className="m-0">
            Թվային գրադարան՝ նվիրված Հայաստանյայց Առաքելական Սուրբ Եկեղեցու հոգևոր ժառանգությանը։
            Մեր հոգևորականների քարոզներն ու ձայնագրությունները, աղոթքներն ու գրությունները համացանցում շատ են, բայց ցրված են տարբեր կայքերում ու ալիքներում։
            Այստեղ դրանք հավաքվում են մեկ տեղում՝ խնամքով դասավորված, որ հեշտ լինի գտնել, կարդալ և լսել։
          </p>
        </section>
        <section className={panel}>
          <h2 className={heading}>Որտեղից են նյութերը</h2>
          <p className="m-0">
            Նոր նյութերը նախ տեղադրվում են մեր{" "}
            <a className="text-gold-bright" href="https://t.me/armenian_apostolic_church" target="_blank" rel="noreferrer">Telegram խմբում</a>
            {" "}և նույն պահին հասանելի են դառնում նաև այստեղ։
            Սաղմոսների համարակալումը ըստ Յոթանասնից թարգմանության է, ինչպես ընդունված է Հայաստանյայց Առաքելական Եկեղեցում։
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
      </article>
    </PageShell>
  );
}
