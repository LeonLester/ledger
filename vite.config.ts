import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  define: { __BUILD__: JSON.stringify(process.env.BUILD_NUMBER ?? "dev") },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Ledger training log",
        short_name: "Ledger",
        description: "Mesocycle training log with volume landmarks and feedback-driven progression.",
        theme_color: "#101215",
        background_color: "#101215",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,png,woff2}"], navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
});
