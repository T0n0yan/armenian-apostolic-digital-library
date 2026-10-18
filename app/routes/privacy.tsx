import type { Route } from "./+types/privacy";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";

const CONTACT_EMAIL = "t0n0yan.contact@gmail.com";
const UPDATED = "19 հոկտեմբերի, 2026";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Գաղտնիության քաղաքականություն — Հոգևոր ժառանգություն" },
    { name: "description", content: "Ինչ տվյալներ է պահում Հոգևոր ժառանգություն գրադարանը և ինչպես է դրանք օգտագործում։" },
  ];
}

const sections: Array<{ title: string; body: string[] }> = [
  {
    title: "Ինչ ենք պահում",
    body: [
      "Telegram-ով մուտք գործելիս՝ քո Telegram ID-ն, անունը և օգտանունը (username), որոնք Telegram-ը փոխանցում է Mini App-ին։",
      "Google-ով մուտք գործելիս՝ Google հաշվի նույնացուցիչը, անունը և էլ. հասցեն։ Գաղտնաբառը մենք չենք տեսնում և չենք պահում։",
      "Քո պահած նյութերը, դրանց նշումները և կարդալու հիշեցումները (նյութը, ժամը և կրկնությունը)։",
    ],
  },
  {
    title: "Ինչի համար ենք օգտագործում",
    body: [
      "Միայն գրադարանի աշխատանքի համար՝ որ «Իմ անկյունը» բաժինը պահի քո ընտրածը, և որ հիշեցումները գան նշված ժամին։",
      "Հիշեցումները Telegram-ում ուղարկում է գրադարանի բոտը, միայն եթե դու ինքդ թույլ ես տվել նրան գրել քեզ։",
      "Մենք չենք վաճառում, չենք փոխանցում և չենք օգտագործում քո տվյալները գովազդի համար։",
    ],
  },
  {
    title: "Որտեղ են պահվում",
    body: [
      "Տվյալները պահվում են Cloudflare-ի ապահով սերվերներում։ Մուտքի նիստը պահվում է քո բրաուզերում՝ ստորագրված cookie-ի տեսքով, 30 օր։",
      "Որոնման վիճակագրությունը (ինչ բառեր են որոնվում) պահվում է առանց անձնական տվյալների։",
    ],
  },
  {
    title: "Քո իրավունքները",
    body: [
      "Ցանկացած պահի կարող ես հեռացնել պահած նյութերն ու հիշեցումները, ինչպես նաև դուրս գալ հաշվից։",
      `Եթե ուզում ես, որ ամբողջությամբ ջնջենք քո տվյալները, գրիր ${CONTACT_EMAIL} հասցեին, և մենք կջնջենք դրանք 30 օրվա ընթացքում։`,
    ],
  },
];

/** The privacy policy (linked from Google's sign-in screen and from «Իմ անկյունը»). */
export default function Privacy() {
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/" backLabel="Գրադարան" title="Գաղտնիության քաղաքականություն" description={`Թարմացվել է՝ ${UPDATED}`} />
      <article className="mt-4 grid gap-4">
        <p className="m-0 frosted-panel px-5 py-4 text-[14.5px] leading-[1.75] text-ink">
          «Հոգևոր ժառանգություն» գրադարանը (Telegram Mini App և կայք) նվիրված է Հայ Առաքելական Սուրբ Եկեղեցու հոգևոր նյութերին։ Այստեղ պարզ բացատրում ենք, թե ինչ տվյալներ ենք պահում և ինչու։
        </p>
        {sections.map((section) => (
          <section key={section.title} className="frosted-panel grid gap-2.5 px-5 py-4">
            <h2 className="m-0 font-noto text-[17px] font-semibold text-gold-bright">{section.title}</h2>
            <ul className="m-0 grid list-disc gap-2 pl-5 text-[14px] leading-[1.7] text-ink marker:text-gold">
              {section.body.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </section>
        ))}
        <p className="m-0 text-center text-[13px] text-muted">
          Հարցերի համար՝ <a className="text-gold-bright" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </article>
    </PageShell>
  );
}
