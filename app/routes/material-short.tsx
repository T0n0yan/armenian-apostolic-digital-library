import type { Route } from "./+types/material-short";
import { loadMaterialPage } from "../data/material-page.server";
import { materialIdFromShortPath } from "../utils/material-path";

export { default, meta, ErrorBoundary } from "./material";

/** A material by its short address: /pray_364, /psalm_363, /saint_120… */
export async function loader({ params, request }: Route.LoaderArgs) {
  return loadMaterialPage(materialIdFromShortPath(params.shortPath), request);
}
