import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 5173 is Vite's default and often taken by another project.
  server: { port: 5180 },
});
