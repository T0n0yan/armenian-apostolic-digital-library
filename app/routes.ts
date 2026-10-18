import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("search", "routes/search.tsx"),
  route("api/search-page", "routes/search-page.ts"),
  route("api/search-suggestions", "routes/search-suggestions.ts"),
  route("saved", "routes/saved.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("telegram/session", "routes/telegram-session.ts"),
  route("auth/google", "routes/auth-google.ts"),
  route("auth/google/callback", "routes/auth-google-callback.ts"),
  route("auth/logout", "routes/auth-logout.ts"),
  route("api/share-prepare", "routes/share-prepare.ts"),
  route("api/reminders", "routes/reminders.ts"),
  route("api/push", "routes/push.ts"),
  route("media/:chatId/:messageId/:mediaIndex", "routes/media.ts"),
  route("materials/:materialId", "routes/material.tsx"),
  route("categories/:slug", "routes/category.tsx"),
  route("api/categories/:slug/posts", "routes/category-page.ts"),
  route("admin", "routes/admin.tsx"),
] satisfies RouteConfig;
