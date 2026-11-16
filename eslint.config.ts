import { defineConfig } from "eslint/config"
import medusa from "@medusajs/eslint-plugin"
import turboConfig from "eslint-config-turbo/flat"

export default defineConfig([
    ...medusa.configs.recommended,
    ...turboConfig,
])
