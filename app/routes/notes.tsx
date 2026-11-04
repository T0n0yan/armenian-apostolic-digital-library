import { redirect } from "react-router";

import type { Route } from "./+types/notes";

/** Հին հասցե. «Իմ նշումները» այժմ «Իմ անկյունը»-ի ներդիր է։ */
export function loader({ request }: Route.LoaderArgs) {
  const tab = new URL(request.url).searchParams.get("tab");
  const kind = tab === "questions" || tab === "notes" ? `&kind=${tab}` : "";
  return redirect(`/saved?tab=notes${kind}`, 301);
}
