import type { Config } from "@react-router/dev/config";

export default {
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  // The whole route list (about 30 routes) ships with the first page, so links never ask the
  // Worker for /__manifest; each of those requests counted against the daily limit.
  routeDiscovery: { mode: "initial" },
} satisfies Config;
