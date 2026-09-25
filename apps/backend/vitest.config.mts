import { defineConfig } from "vitest/config";
import path from "path";
import { loadEnv } from "@medusajs/framework/utils";

// Load test environment variables identical to the Jest setup
loadEnv("test", process.cwd());

// Determine test pattern based on TEST_TYPE env variable
function getTestIncludePatterns(): string[] {
  const testType = process.env.TEST_TYPE;

  if (testType === "integration:http") {
    return ["integration-tests/http/*.spec.[jt]s"];
  }
  if (testType === "integration:modules") {
    return ["src/modules/*/__tests__/**/*.[jt]s"];
  }
  if (testType === "unit") {
    return [
      "src/**/__tests__/**/*.unit.spec.[jt]s",
      "src/**/*.unit.test.[jt]s",
    ];
  }

  // Fallback: Default to all unit and integration test specs
  return ["src/**/__tests__/**/*.[jt]s", "src/**/*.{test,spec}.[jt]s?(x)", "integration-tests/**/*.spec.[jt]s"];
}

export default defineConfig({
  test: {
    name: "backend",
    environment: "node",
    globals: true,
    setupFiles: ["./integration-tests/setup.js"],
    include: getTestIncludePatterns(),
    exclude: ["**/node_modules/**", "dist/**", ".medusa/**", "**/src/workflows/sanity-sync/__tests__/**"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    testTimeout: 30000,
  },
});
