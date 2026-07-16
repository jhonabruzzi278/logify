/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

const edgeTarget = process.env.LOGIFY_EDGE_TARGET ?? "http://localhost:8080";
const localstackTarget = process.env.LOCALSTACK_TARGET ?? "http://localhost:4567";

function stripBrowserOrigin(proxy: any) {
  proxy.on("proxyReq", (proxyReq: any) => {
    proxyReq.removeHeader("origin");
    proxyReq.removeHeader("referer");
  });
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      includeAssets: ["favicon.svg", "icon-app.svg", "mask-icon.svg"],
      manifest: {
        name: "Logify",
        short_name: "Logify",
        description: "Dashboard logistico mobile-first para inventario, pedidos, envios y alertas.",
        theme_color: "#0f172a",
        background_color: "#f6f7f3",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icon-app.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any"
          },
          {
            src: "/mask-icon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "maskable"
          }
        ]
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"]
      },
      devOptions: {
        enabled: true,
        type: "module"
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    host: true,
    port: 3000,
    allowedHosts: [".ngrok-free.app"],
    headers: {
      "ngrok-skip-browser-warning": "true"
    },
    proxy: {
      "/aws/cognito": {
        target: localstackTarget,
        changeOrigin: true,
        rewrite: () => "/",
        configure: stripBrowserOrigin
      },
      "/_aws/cognito-idp": {
        target: localstackTarget,
        changeOrigin: true,
        configure: stripBrowserOrigin
      },
      "/api": {
        target: edgeTarget,
        changeOrigin: true
      },
      "/actuator": {
        target: edgeTarget,
        changeOrigin: true
      }
    }
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/setup-tests.ts"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      exclude: [
        "node_modules/**",
        "dist/**",
        "dev-dist/**",
        "src/vite-env.d.ts",
        "src/main.tsx",
        "src/app/router.tsx",
        "src/setup-tests.ts",
        "**/*.d.ts",
        "vite.config.ts",
        "postcss.config.cjs",
        "tailwind.config.ts"
      ]
    }
  }
});