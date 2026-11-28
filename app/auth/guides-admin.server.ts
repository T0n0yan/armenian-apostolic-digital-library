import { env } from "cloudflare:workers";
import { redirect } from "react-router";
import { requirePermission } from "./admin.server";

/** «guides» իրավունքով ադմինը. իրավունք չունեցողը տեղափոխվում է գլխավոր էջ։ */
export function guidesAdmin(request: Request) {
  return requirePermission(request, env.DB, "guides").catch((error: unknown) => {
    if (error instanceof Response && (error.status === 401 || error.status === 403)) throw redirect("/");
    throw error;
  });
}
