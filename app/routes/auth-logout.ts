import type { Route } from "./+types/auth-logout";
import { clearAdminNavigationCookie } from "../auth/admin.server";
import { clearSessionCookie, requireSameOriginUserRequest } from "../auth/telegram-user.server";

/** Signs the reader out (POST from «Իմ անկյունը»). */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  const headers = new Headers({ location: "/saved", "cache-control": "no-store" });
  headers.append("set-cookie", clearSessionCookie(request));
  headers.append("set-cookie", clearAdminNavigationCookie(request));
  return new Response(null, { status: 303, headers });
}
