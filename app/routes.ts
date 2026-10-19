import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("search", "routes/search.tsx"),
  route("api/search-page", "routes/search-page.ts"),
  route("api/search-suggestions", "routes/search-suggestions.ts"),
  route("saved", "routes/saved.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("settings", "routes/settings.tsx"),
  route("telegram/session", "routes/telegram-session.ts"),
  route("auth/google", "routes/auth-google.ts"),
  route("auth/google/callback", "routes/auth-google-callback.ts"),
  route("auth/logout", "routes/auth-logout.ts"),
  route("api/share-prepare", "routes/share-prepare.ts"),
  route("api/reminders", "routes/reminders.ts"),
  route("api/push", "routes/push.ts"),
  route("api/poll-vote", "routes/poll-vote.ts"),
  route("api/psalm-timings", "routes/psalm-timings.ts"),
  route("api/reading-log", "routes/reading-log.ts"),
  route("media/:chatId/:messageId/:mediaIndex", "routes/media.ts"),
  route("materials/:materialId", "routes/material.tsx"),
  route("categories/:slug", "routes/category.tsx"),
  route("api/categories/:slug/posts", "routes/category-page.ts"),
  route("admin", "routes/admin.tsx"),
  // Short material addresses (/pray_364); static routes above always win.
  route(":shortPath", "routes/material-short.tsx"),
] satisfies RouteConfig;
