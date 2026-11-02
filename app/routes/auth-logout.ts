import type { Route } from "./+types/auth-logout";
import { clearAdminNavigationCookie } from "../auth/admin.server";
import { clearSessionCookie, getOptionalTelegramUser, requireSameOriginUserRequest, revokeAllSessions } from "../auth/telegram-user.server";

/** Signs the reader out (POST from «Իմ անկյունը»). */
export async function action({ request }: Route.ActionArgs) {
  requireSameOriginUserRequest(request);
  // «Ելք բոլոր սարքերից». բարձրացնում ենք session_epoch-ը, մյուս սարքերի cookie-ները դադարում են գործել։
  const form = await request.formData().catch(() => null);
  if (form?.get("scope") === "all") {
    const user = await getOptionalTelegramUser(request);
    if (user) await revokeAllSessions(user.id);
  }
  const headers = new Headers({ location: "/saved", "cache-control": "no-store" });
  headers.append("set-cookie", clearSessionCookie(request));
  headers.append("set-cookie", clearAdminNavigationCookie(request));
  return new Response(null, { status: 303, headers });
}
