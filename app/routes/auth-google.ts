import type { Route } from "./+types/auth-google";
import { safeReturnPath, startGoogleSignIn } from "../auth/google.server";

/** /auth/google?return=/saved — sends the reader to Google to sign in. */
export async function loader({ request }: Route.LoaderArgs) {
  const returnTo = safeReturnPath(new URL(request.url).searchParams.get("return"));
  const start = await startGoogleSignIn(request, returnTo);
  if (!start) return Response.redirect(new URL("/saved?signin=unavailable", request.url), 302);
  return new Response(null, { status: 302, headers: { location: start.location, "set-cookie": start.cookie, "cache-control": "no-store" } });
}
