import { env } from "cloudflare:workers";
import { contentVersion } from "../data/content-version.server";
export async function loader() {
  return Response.json({ version: await contentVersion(env.DB) }, { headers: { "Cache-Control": "public, max-age=30" } });
}
