import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      tslib: path.resolve(__dirname, "node_modules/tslib/tslib.es6.mjs")
    }
  },
  optimizeDeps: {
    include: ["@supabase/supabase-js", "tslib"]
  },
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.svg"],
      manifest: {
        name: "PocketRinggit AI Budget",
        short_name: "PocketRinggit",
        description: "AI budgeting app for Malaysia with screenshot and receipt ingestion.",
        start_url: "/",
        display: "standalone",
        background_color: "#f2f6fb",
        theme_color: "#0d5fd7",
        icons: [
          {
            src: "/pwa-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any maskable"
          },
          {
            src: "/pwa-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      }
    })
  ]
});
