import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("search", "routes/search.tsx"),
  route("saved", "routes/saved.tsx"),
  route("telegram/session", "routes/telegram-session.ts"),
  route("media/:chatId/:messageId/:mediaIndex", "routes/media.ts"),
  route("materials/:materialId", "routes/material.tsx"),
  route("categories/:slug", "routes/category.tsx"),
  route("admin", "routes/admin.tsx"),
] satisfies RouteConfig;
