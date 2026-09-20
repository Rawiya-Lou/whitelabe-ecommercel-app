import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { codeInput } from "@sanity/code-input";
import uiTranslation from "./schemas/uiTranslation";
import { localizedString, localizedText } from "./schemas/localizedObjects";
import { category } from "./schemas/category";
import { product } from "./schemas/product";
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || "4vzx52ot";
const dataset = process.env.SANITY_STUDIO_DATASET || "production";
export default defineConfig({
  name: "default",
  title: "DTC E-Commerce Studio",

  projectId,
  dataset,

  basePath: '/studio',

  plugins: [
    structureTool(),
    visionTool(),
    codeInput(), // Required for UI translation JSON code field
  ],

  schema: {
    types: [uiTranslation,
  localizedString,
  localizedText,
  category,
  product],
  },
});
