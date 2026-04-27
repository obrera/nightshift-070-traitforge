import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@obrera/mpl-core-kit-lib": path.resolve(
        rootDir,
        "packages/mpl-core-kit-lib/dist/index.js"
      )
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001"
    }
  },
  build: {
    outDir: "dist/public",
    emptyOutDir: true
  }
});
