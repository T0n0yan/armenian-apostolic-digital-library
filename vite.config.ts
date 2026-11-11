import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
  ],
  build: {
    rolldownOptions: {
      output: {
        // lucide-ի ամեն պատկերակ առանձին 200–500 բայթանոց ֆայլ էր դառնում (էջը բեռնում էր 45–53 JS ֆայլ).
        // բոլորը մեկ ֆայլում՝ թույլ ինտերնետով տասնյակ հարցում պակաս։
        codeSplitting: { groups: [{ name: "icons", test: /node_modules[\\/]lucide-react/u }] },
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
});
