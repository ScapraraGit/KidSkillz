import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Monorepo shares a single root .env; point Vite there so VITE_* vars
// (BILLING_ENABLED, API_URL, etc.) load from one source of truth.
const envDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  envDir,
  plugins: [react()],
  server: { port: 5173 },
  preview: {
    port: 5173,
    allowedHosts: ["chorechampz.com", "www.chorechampz.com", ".up.railway.app"],
  },
});
