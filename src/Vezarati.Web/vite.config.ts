import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [] } },\n  server: { port: 5173, proxy: { "/api": "http://localhost:5080" } },
  build: { outDir: "dist", emptyOutDir: true }
});
