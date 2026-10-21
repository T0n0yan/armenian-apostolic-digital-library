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
          <h2 className={heading}>Ինչու այս գրադարանը</h2>
          <p className="m-0">
            Մեր հոգևորականների քարոզները, աղոթքներն ու ձայնագրությունները համացանցում շատ են, բայց ցրված են տարբեր կայքերում ու ալիքներում։
            Այստեղ դրանք հավաքվում են մեկ տեղում՝ խնամքով դասավորված, որ հեշտ լինի գտնել, կարդալ և լսել։
          </p>
          <p className="m-0">
            Նոր նյութերը նախ տեղադրվում են մեր{" "}
            <a className="text-gold-bright" href="https://t.me/armenian_apostolic_church" target="_blank" rel="noreferrer">Telegram խմբում</a>
            {" "}և նույն պահին հասանելի են դառնում նաև այստեղ։
            Սաղմոսների համարակալումը ըստ Յոթանասնից թարգմանության է, ինչպես ընդունված է մեր Եկեղեցում։
          </p>
        </section>
      </article>
    </PageShell>
  );
}
