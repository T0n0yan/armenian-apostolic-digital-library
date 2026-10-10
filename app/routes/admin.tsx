import { isRouteErrorResponse } from "react-router";

import type { Route } from "./+types/admin";
import { requireAdmin } from "../auth/admin.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Կառավարում — Թվային գրադարան" },
    { name: "robots", content: "noindex, nofollow, noarchive" },
    { name: "theme-color", content: "#f6f2e9" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  return { admin: await requireAdmin(request) };
}

export default function Admin({ loaderData }: Route.ComponentProps) {
  const isLocalDevelopment = loaderData.admin.source === "local-development";

  return (
    <main className="admin-page">
      <header className="admin-header">
        <p className="library-kicker">Կառավարման էջ</p>
        <h1>Նյութերի հղումների ինդեքս</h1>
        <p>
          Անվտանգ մուտքի սահմանը գործում է։ Նյութերի ավելացումը կկառուցենք
          հաջորդ փոքր քայլով։
        </p>
      </header>

      <section className="admin-status" aria-labelledby="admin-status-title">
        <span className="admin-status-mark" aria-hidden="true">
          ✓
        </span>
        <div>
          <h2 id="admin-status-title">Մուտքը հաստատված է</h2>
          <p>
            {isLocalDevelopment
              ? "Local development ռեժիմ"
              : `Cloudflare Access · ${loaderData.admin.email}`}
          </p>
        </div>
      </section>

      <a className="admin-back-link" href="/">
        Վերադառնալ գրադարան
      </a>
    </main>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const isForbidden = isRouteErrorResponse(error) && error.status === 403;

  return (
    <main className="admin-page">
      <header className="admin-header">
        <p className="library-kicker">Կառավարման էջ</p>
        <h1>{isForbidden ? "Մուտքը փակ է" : "Սխալ"}</h1>
        <p>
          {isForbidden
            ? "Այս էջը հասանելի է միայն հաստատված ադմինիստրատորին։"
            : "Կառավարման էջը բացելիս անսպասելի սխալ է տեղի ունեցել։"}
        </p>
      </header>

      <a className="admin-back-link" href="/">
        Վերադառնալ գրադարան
      </a>
    </main>
  );
}
