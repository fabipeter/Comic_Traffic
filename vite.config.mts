import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    headers: {
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), unload=*",
    },
  },
  preview: {
    port: 3000,
    headers: {
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), unload=*",
    },
  },
  build: {
    outDir: "build",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.ts",
  },
});
