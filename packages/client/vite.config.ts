import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const devProxyTarget = process.env["VITE_DEV_PROXY_TARGET"] || "http://127.0.0.1:3000";
const vendorChunkGroups = [
  {
    name: "react-vendor",
    test: /node_modules[\\/](react|react-dom|react-router-dom)[\\/]/,
    priority: 60,
  },
  {
    name: "query-auth-vendor",
    test: /node_modules[\\/](@tanstack[\\/]react-query|better-auth)[\\/]/,
    priority: 55,
  },
  {
    name: "ui-vendor",
    test: /node_modules[\\/](@radix-ui|cmdk|vaul|sonner|input-otp|embla-carousel-react)[\\/]/,
    priority: 50,
  },
  {
    name: "charts-vendor",
    test: /node_modules[\\/](recharts|d3-|victory-vendor)[\\/]/,
    priority: 45,
  },
  {
    name: "form-vendor",
    test: /node_modules[\\/](react-hook-form|@hookform)[\\/]/,
    priority: 40,
  },
  {
    name: "date-vendor",
    test: /node_modules[\\/](date-fns|@js-temporal)[\\/]/,
    priority: 35,
  },
  {
    name: "motion-vendor",
    test: /node_modules[\\/](framer-motion)[\\/]/,
    priority: 30,
  },
  {
    name: "vendor",
    test: /node_modules[\\/]/,
    priority: 1,
    maxSize: 450 * 1024,
  },
];
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
  server: {
    port: 5173,
    headers: {
      "Content-Security-Policy": contentSecurityPolicy,
    },
    proxy: {
      "/api": devProxyTarget,
      "/_": devProxyTarget,
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: vendorChunkGroups,
        },
      },
    },
  },
});
