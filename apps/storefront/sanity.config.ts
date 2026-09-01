import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { env } from "./app/env.mjs";

export default defineConfig({
  name: "default",
  title: "Client Storefront CMS",
  projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID || "",
  dataset: env.NEXT_PUBLIC_SANITY_DATASET || "production",
  basePath: "/studio",
  plugins: [structureTool()],
  schema: {
    types: [], // Your schema definitions will be registered here in Phase 3
  },
});