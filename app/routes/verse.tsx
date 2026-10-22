import { env } from "cloudflare:workers";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { Link, redirect } from "react-router";

import type { Route } from "./+types/verse";
import { PageHeader, PageShell } from "../components/page-layout";
import { SiteNav } from "../components/site-nav";
import { ShareButton } from "../components/share-button";
import { RouteErrorPage } from "../components/error-page";
import { getPublicMaterialDetail } from "../data/material-detail.server";
import { canonicalMaterialPath, resolveMaterialId } from "../data/material-page.server";
import { psalmBodyText } from "../utils/material-title";
import { ogCardVersion } from "../data/og-cards.server";
import { psalmVerseList, verseLabel } from "../utils/psalm-verses";
import { NOINDEX, SITE_NAME, absoluteUrl, breadcrumbJsonLd, describe, cardImage, seoMeta } from "../utils/seo";
import { resolveContentCategoryId } from "../../shared/telegram-bridge-contract";

/** One psalm verse on its own page (/saghmosner/22/3): what the verse popup's "Կիսվել" shares. */
export async function loader({ params, request }: Route.LoaderArgs) {
  const number = /^\d{1,3}$/u.test(params.verse) ? Number(params.verse) : 0;
  const materialId = number > 0 ? await resolveMaterialId(params) : null;
  const material = materialId ? await getPublicMaterialDetail(env.DB, materialId, request.signal) : null;
  if (!material || resolveContentCategoryId(null, material.categoryName) !== "category_psalms") throw new Response("Not Found", { status: 404 });
  const verses = psalmVerseList(psalmBodyText(material));
  const position = verses.findIndex((verse) => verse.number === number);
  if (position < 0) throw new Response("Not Found", { status: 404 });
  const psalmPath = canonicalMaterialPath(material);
  const path = `${psalmPath}/${number}`;
  const pathname = new URL(request.url).pathname.replace(/\.data$/u, "");
  if (decodeURIComponent(pathname) !== path) throw redirect(path, 301);
  return {
    origin: new URL(request.url).origin,
    version: ogCardVersion(material),
    path,
    psalmPath,
    title: material.title,
    categoryName: material.categoryName,
    label: verseLabel(psalmPath, material.title, number),
    verse: number,
    text: verses[position].text,
    previous: verses[position - 1]?.number ?? null,
    next: verses[position + 1]?.number ?? null,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: `Համար — ${SITE_NAME}` }, ...NOINDEX];
  const description = describe(loaderData.text, loaderData.label);
  return seoMeta({
    title: `${loaderData.label} — ${SITE_NAME}`,
    description,
    path: loaderData.path,
    origin: loaderData.origin,
    image: cardImage(loaderData.origin, loaderData.path, loaderData.version),
    type: "article",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Quotation",
        text: loaderData.text,
        inLanguage: "hy",
        url: absoluteUrl(loaderData.path),
        isPartOf: { "@type": "CreativeWork", name: loaderData.title, url: absoluteUrl(loaderData.psalmPath) },
      },
      breadcrumbJsonLd([{ name: SITE_NAME, path: "/" }, { name: loaderData.categoryName, path: "/saghmosner" }, { name: loaderData.title, path: loaderData.psalmPath }, { name: loaderData.label, path: loaderData.path }]),
    ],
  });
}

const stepLink = "inline-flex min-h-11 items-center gap-1 rounded-[14px] border border-glass-border bg-subtle px-3.5 text-[13px] font-bold text-ink no-underline";

export default function VersePage({ loaderData }: Route.ComponentProps) {
  const { label, text, psalmPath, verse, previous, next, title } = loaderData;
  return (
    <PageShell>
      <SiteNav />
      <PageHeader backTo={psalmPath} backLabel={title} title={label} />
      <article className="prayer-text psalm-text mt-4 grid gap-4">
        <blockquote className="reading-body m-0 frosted-panel px-5 py-8 text-center text-[length:calc(var(--reading-size)*1.2)] leading-[1.8] text-ink shadow-card min-[560px]:px-9 min-[560px]:py-10">
          <p className="m-0 mb-4 font-sans text-[13px] font-bold tracking-[0.04em] text-gold">{label}</p>
          <p className="m-0">«{text}»</p>
        </blockquote>
        {/* The reader goes on from this verse in the whole psalm. */}
        <Link className="flex min-h-12 items-center justify-center gap-2 rounded-[16px] bg-[linear-gradient(135deg,#e2c27e,#b07d2e)] px-4 font-sans text-[15px] font-bold text-[#2a1708] no-underline shadow-card" to={`${psalmPath}#${verse}`}>
          <BookOpen aria-hidden="true" size={18} /> Կարդալ ամբողջ սաղմոսը
        </Link>
        <div className="flex items-center justify-between gap-2 font-sans">
          {previous ? <Link className={stepLink} to={`${psalmPath}/${previous}`} aria-label={`Նախորդ համարը՝ ${previous}`}><ChevronLeft aria-hidden="true" size={17} /> {previous}</Link> : <span />}
          <ShareButton className={stepLink} title={label} text={`«${text}»`} pageUrl={loaderData.path} cardPath={loaderData.path} label />
          {next ? <Link className={stepLink} to={`${psalmPath}/${next}`} aria-label={`Հաջորդ համարը՝ ${next}`}>{next} <ChevronRight aria-hidden="true" size={17} /></Link> : <span />}
        </div>
      </article>
    </PageShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorPage error={error} notFoundTitle="Համարը չի գտնվել" />;
}
