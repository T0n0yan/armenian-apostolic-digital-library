import { redirect } from "react-router";
import type { Route } from "./+types/etiquette-redirect";

/** Հին հասցեները (/etiquette, /etiquette/candles) տանում են «Կարգեր և վարքեր»-ի մեջ։ */
export function loader({ params, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return redirect(`/church/etiquette${params.topic ? `/${params.topic}` : ""}${url.search}${url.hash}`, 301);
}
