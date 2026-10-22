import { Home, RotateCw, Search } from "lucide-react";
import { isRouteErrorResponse, Link } from "react-router";

import { PageShell } from "./page-layout";
import { SiteNav } from "./site-nav";
import { glassPanel } from "./ui-styles";
import { SUPPORT_EMAIL } from "../utils/contact";

type ErrorCopy = { title: string; text: string; retry: boolean };

/** What a reader is told for each kind of failure; anything unknown counts as a server error. */
export function errorCopy(status: number): ErrorCopy {
  if (status === 404) return { title: "Էջը չի գտնվել", text: "Հնարավոր է՝ հասցեն սխալ է գրված, կամ էջը տեղափոխվել է։ Փորձեք գտնել որոնումով կամ վերադարձեք գլխավոր էջ։", retry: false };
  if (status === 401 || status === 403) return { title: "Այս էջը հասանելի չէ", text: "Այս էջը բաց է միայն կայքի խմբագիրների համար։", retry: false };
  if (status === 503) return { title: "Կայքը կարճ ժամանակով անհասանելի է", text: "Կատարվում են աշխատանքներ։ Խնդրում ենք փորձել մի քանի րոպեից։", retry: true };
  return { title: "Ինչ-որ բան այնպես չգնաց", text: "Էջը բացելիս սխալ տեղի ունեցավ։ Փորձեք կրկին մի փոքր ուշ։", retry: true };
}

/** A calm page for 404s and failures: what happened, and the ways back into the library. */
export function ErrorPage({ status, notFoundTitle }: { status: number; notFoundTitle?: string }) {
  const copy = errorCopy(status);
  const { text, retry } = copy;
  const title = status === 404 && notFoundTitle ? notFoundTitle : copy.title;
  const button = "inline-flex min-h-11 items-center gap-2 rounded-[12px] px-4 text-[13px] font-bold no-underline";
  return (
    <section className={`${glassPanel} mx-auto mt-6 grid max-w-[560px] justify-items-center gap-3 px-6 py-10 text-center`} data-error-status={status}>
      <span className="font-noto text-[44px] leading-none font-semibold text-gold-bright/70" aria-hidden="true">{status === 404 ? "404" : "✠"}</span>
      <h1 className="m-0 font-noto text-[22px] font-semibold text-ink">{title}</h1>
      <p className="m-0 max-w-[420px] text-[14px] leading-[1.7] text-muted">{text}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2.5">
        <Link className={`${button} border border-[rgb(217_181_111/30%)] bg-[rgb(217_181_111/14%)] text-gold-bright`} to="/">
          <Home aria-hidden="true" size={16} /> Գլխավոր էջ
        </Link>
        {retry ? (
          <button className={`${button} cursor-pointer border border-glass-border bg-subtle text-ink`} type="button" onClick={() => window.location.reload()}>
            <RotateCw aria-hidden="true" size={16} /> Կրկին փորձել
          </button>
        ) : (
          <Link className={`${button} border border-glass-border bg-subtle text-ink`} to="/search">
            <Search aria-hidden="true" size={16} /> Որոնել
          </Link>
        )}
      </div>
      <p className="m-0 mt-3 text-[12px] text-faint">
        Եթե խնդիրը կրկնվում է, գրեք մեզ՝ <a className="text-gold-bright" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
    </section>
  );
}

/** A route's error boundary: the site's navigation and the error page for whatever was thrown. */
export function RouteErrorPage({ error, notFoundTitle }: { error: unknown; notFoundTitle?: string }) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  return (
    <PageShell>
      <SiteNav />
      <title>{status === 404 ? "Էջը չի գտնվել — Հոգևոր ժառանգություն" : "Սխալ — Հոգևոր ժառանգություն"}</title>
      <meta name="robots" content="noindex" />
      <ErrorPage status={status} notFoundTitle={notFoundTitle} />
    </PageShell>
  );
}
