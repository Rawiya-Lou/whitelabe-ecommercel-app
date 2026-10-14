import { defineConfig, SanityDocument} from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { codeInput } from "@sanity/code-input";
import uiTranslation from "./schemas/uiTranslation";
import { localizedString, localizedText } from "./schemas/localizedObjects";
import { category } from "./schemas/category";
import { product } from "./schemas/product";
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || "4vzx52ot";
const dataset = process.env.SANITY_STUDIO_DATASET || "development";
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

   validation: {
    async validateDocument({ document, getClient }: { document: SanityDocument; getClient: (options: { apiVersion: string }) => any }) {
      if (document?._type !== 'product') return []

      const categoriesArray = (document as any).categories
      if (!categoriesArray || !Array.isArray(categoriesArray) || categoriesArray.length === 0) {
        return []
      }
      const targetReferences = categoriesArray.map((ref: any) => ref?._ref).filter(Boolean)
      const hasDraftPointers = targetReferences.some((refId: string) => refId.startsWith('drafts.'))

      if (hasDraftPointers) {
        return [
          {
            message: 'Category reference layers are adjusting cache streams. Click Publish again in one second.',
            path: ['categories'],
            level: 'warning', 
          },
        ]
      }

      return []
    },
  },
});
