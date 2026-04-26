import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
      "/health": "http://localhost:3001",
      "/defaults": "http://localhost:3001",
    },
  },
});
