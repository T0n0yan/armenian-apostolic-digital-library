import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("search", "routes/search.tsx"),
  route("api/search-page", "routes/search-page.ts"),
  route("saved", "routes/saved.tsx"),
  route("telegram/session", "routes/telegram-session.ts"),
  route("api/share-prepare", "routes/share-prepare.ts"),
  route("media/:chatId/:messageId/:mediaIndex", "routes/media.ts"),
  route("materials/:materialId", "routes/material.tsx"),
  route("categories/:slug", "routes/category.tsx"),
  route("api/categories/:slug/posts", "routes/category-page.ts"),
  route("admin", "routes/admin.tsx"),
] satisfies RouteConfig;
