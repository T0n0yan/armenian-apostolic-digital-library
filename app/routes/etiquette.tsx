import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import type { Route } from "./+types/etiquette";
import prayersImage from "../assets/prayers.webp";
import { ArtImage } from "../components/art-image";
import { BirdLetter, KindBadge, OrnamentDivider } from "../components/etiquette-ui";
import { PageHeader, PageShell, PageTitle } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { ETIQUETTE_TOPICS, RULE_KINDS, type RuleKind } from "../data/etiquette";
import { seoMeta } from "../utils/seo";

export function meta({}: Route.MetaArgs) {
  return seoMeta({
    title: "Եկեղեցական վարվելակարգ — Apostolic.am",
    description: "Ինչպես վարվել եկեղեցում. խաչակնքում, մոմավառություն, գլխաշոր, Պատարագի ժամանակ, հոգևորականի հետ։ Ամեն կանոնի կողքին՝ ինչու է այդպես։",
    path: "/etiquette",
  });
}

/** Վարվելակարգի բաժինները՝ Ա–Թ, թռչնատառերով։ */
export default function Etiquette() {
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo="/" backLabel="Գրադարան" title="" />

      {/* Ժամանակավոր նկար (Աղոթքներից). բաժինը պետք է ունենա իր նկարը։ */}
      <header className="grid justify-items-center gap-2 text-center">
        <div className="flex min-h-[160px] w-full items-center justify-center min-[390px]:min-h-[180px]">
          <ArtImage className="block h-full w-full object-cover" src={prayersImage} width={1774} height={887} fetchPriority="high" decoding="async" alt="" />
        </div>
        <h1 className="m-0 text-[28px] leading-[34px] font-medium tracking-[-0.4px] text-ink min-[768px]:text-[40px] min-[768px]:leading-[46px]">
          <PageTitle title="Վարվելակարգ" ornate />
        </h1>
        <OrnamentDivider />
        <p className="m-0 max-w-[560px] text-[14px] leading-[1.7] text-muted">
          Ինչպես մտնել Աստծո տուն, մոմ վառել, կանգնել Պատարագին և դիմել քահանային։ Ամեն կանոնի կողքին՝ <strong className="text-ink">ինչու</strong> է այդպես։
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-1.5" aria-label="Պիտակներ">
          {(Object.keys(RULE_KINDS) as RuleKind[]).map((kind) => <KindBadge key={kind} kind={kind} />)}
        </div>
      </header>

      <ol className="mt-7 grid list-none gap-3 p-0 min-[560px]:grid-cols-2">
        {ETIQUETTE_TOPICS.map((topic, index) => {
          const soon = topic.status === "soon";
          const body = (<>
            <BirdLetter letter={topic.letter} className="w-[52px] shrink-0 text-center text-[52px]" />
            <span className="grid min-w-0 flex-1 gap-1">
              <strong className="font-noto text-[17px] leading-[23px] font-semibold text-ink">{topic.title}</strong>
              <span className="text-[13px] leading-snug text-muted">{topic.description}</span>
              <span className="text-[11.5px] font-semibold text-gold">{soon ? "Շուտով" : `${topic.rules.length} կանոն`}</span>
            </span>
            {soon ? null : <ArrowRight className="shrink-0 text-gold" aria-hidden="true" size={18} strokeWidth={1.8} />}
          </>);
          const card = "frosted-card flex min-h-[104px] items-center gap-4 px-4 py-3.5";
          return (
            <li key={topic.slug} className="hero-rise" style={{ animationDelay: `${200 + index * 60}ms` }}>
              {soon
                ? <div className={`${card} opacity-60 grayscale-[35%]`}>{body}</div>
                : <Link className={`${card} text-inherit no-underline`} to={`/etiquette/${topic.slug}`}>{body}</Link>}
            </li>
          );
        })}
      </ol>

      <p className="mx-auto mt-6 mb-0 max-w-[520px] text-center text-[12.5px] leading-relaxed text-muted">
        ⚑ Տեքստերը դեռ ստուգվում են հոգևորականի կողմից։ Սխալ տեսնե՞լ եք՝ <Link className="text-gold-bright" to="/kap">գրեք մեզ</Link>։
      </p>
    </PageShell>
  );
}
