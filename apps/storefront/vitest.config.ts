import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./app"),
    },
  },
  test: {
    globals: true,
    fileParallelism: false,
    isolate: true,
    onConsoleLog: () => {
      if (typeof window !== "undefined" && global.Event !== window.Event) {
        global.Event = window.Event;
      }
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          env: {
            NODE_ENV: "test",
          },
          include: ["app/**/__tests__/**/*.test.{ts,tsx}"],
          exclude: [
            "**/node_modules/**",
            "**/dist/**",
            "**/.next/**",
            "**/*.integration.test.ts",
          ],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          env: {
            NODE_ENV: "test",
          },
          include: ["app/**/__tests__/**/*.integration.test.ts"],
          exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
        },
      },
    ],
  },
});
