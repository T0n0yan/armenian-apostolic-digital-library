import type { Route } from "./+types/auth-logout";
import { clearSessionCookie, requireSameOriginUserRequest } from "../auth/telegram-user.server";

/** Signs the reader out (POST from «Իմ անկյունը»). */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  return new Response(null, { status: 303, headers: { location: "/saved", "set-cookie": clearSessionCookie(request), "cache-control": "no-store" } });
}
