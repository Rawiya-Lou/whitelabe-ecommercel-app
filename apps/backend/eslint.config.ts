import { defineConfig } from "eslint/config"
import medusa from "@medusajs/eslint-plugin"

export default defineConfig([
  {
    ignores: [
      ".medusa/**",
      "dist/**",
      "public/**",
      ".turbo/**",
      "node_modules/**",
      "static/**",
      "scripts/**",
      "*.log",
    ],
  },
  ...medusa.configs.recommended,
])