import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  // Build-time prerender bundle (src/prerender/entry.tsx): inline CommonJS deps
  // whose named exports Node's ESM loader can't see.
  ssr: {
    noExternal: ["react-helmet-async"],
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
