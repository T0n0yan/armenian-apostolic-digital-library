import { env } from "cloudflare:workers";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import type { Route } from "./+types/auth-telegram";
import { safeReturnPath } from "../auth/google.server";
import { createTelegramLoginSession, getOptionalTelegramUser, requireSameOriginUserRequest, upsertAppUser } from "../auth/telegram-user.server";
import { joinAccounts } from "../data/account-links.server";
import { CandleLoader } from "../components/candle-loader";
import { PageShell } from "../components/page-layout";
import { NOINDEX } from "../utils/seo";

export function meta() {
  return [{ title: "Մուտք Telegram-ով — Հոգևոր ժառանգություն" }, ...NOINDEX];
}

/**
 * Telegram returns the reader here with the signed result after "#tgAuthResult=" (a part of the
 * address the server never sees), so the page posts it back to be checked.
 */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const body = (await request.json().catch(() => null)) as { result?: unknown } | null;
  const result = body?.result && typeof body.result === "object" ? body.result as Record<string, unknown> : null;
  const session = result ? await createTelegramLoginSession(request, result) : null;
  if (!session) return Response.json({ ok: false }, { status: 400, headers: { "cache-control": "no-store" } });
  const current = await getOptionalTelegramUser(request);
  await upsertAppUser(env.DB, session.user);
  // A reader signed in with Google joins that account to their Telegram one.
  if (current?.source === "google") await joinAccounts(env.DB, current.id, session.user);
  return Response.json({ ok: true, joined: current?.source === "google" }, { headers: { "set-cookie": session.cookie, "cache-control": "no-store" } });
}

function decodeResult(hash: string) {
  const encoded = new URLSearchParams(hash.replace(/^#/u, "")).get("tgAuthResult");
  if (!encoded || encoded === "false") return null;
  try {
    const binary = atob(encoded.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "="));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default function TelegramSignIn() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const returnTo = safeReturnPath(new URLSearchParams(window.location.search).get("return"));
    const result = decodeResult(window.location.hash);
    // The signed result should not stay in the address or the history.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (!result) { setFailed(true); return; }
    void fetch("/auth/telegram", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ result }) })
      .then((response) => { if (response.ok) window.location.replace(returnTo); else setFailed(true); })
      .catch(() => setFailed(true));
  }, []);
  return (
    <PageShell>
      <section className="frosted-panel mt-16 grid justify-items-center gap-3 px-5 py-9 text-center">
        {failed ? (
          <>
            <h1 className="m-0 font-noto text-[17px] text-ink">Telegram-ով մուտքը չհաջողվեց</h1>
            <p className="m-0 text-[13px] text-muted">Փորձեք նորից կամ մտեք Google-ով։</p>
            <Link className="font-bold text-gold-bright" to="/saved">Վերադառնալ «Իմ անկյունը»</Link>
          </>
        ) : (
          <>
            <CandleLoader />
            <p className="m-0 text-[13px] text-muted">Մուտք ենք գործում…</p>
          </>
        )}
      </section>
    </PageShell>
  );
}
