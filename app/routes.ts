import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("categories/:slug", "routes/category.tsx"),
  route("admin", "routes/admin.tsx"),
] satisfies RouteConfig;
