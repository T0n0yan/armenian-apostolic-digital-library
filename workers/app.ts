import { createRequestHandler } from "react-router";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, _env, context) {
    const url = new URL(request.url);
    const cacheable = request.method === "GET"
      && !request.headers.has("cookie")
      && !url.searchParams.has("refresh")
      && (url.pathname === "/"
        || url.pathname === "/search"
        || url.pathname.startsWith("/categories/")
        || url.pathname.startsWith("/materials/")
        || url.pathname.startsWith("/api/categories/")
        || url.pathname === "/api/search-page");
    if (!cacheable) return requestHandler(request);
    const cache = (caches as CacheStorage & { default: Cache }).default;
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await requestHandler(request);
    if (response.status !== 200 || response.headers.has("set-cookie")) return response;
    const cacheResponse = new Response(response.body, response);
    cacheResponse.headers.set("Cache-Control", "public, max-age=30, s-maxage=60");
    context.waitUntil(cache.put(request, cacheResponse.clone()));
    return cacheResponse;
  },
} satisfies ExportedHandler<Env>;
