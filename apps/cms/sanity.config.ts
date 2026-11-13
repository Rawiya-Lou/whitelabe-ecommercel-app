import { defineConfig, type SanityDocument, type SanityClient } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { codeInput } from "@sanity/code-input";
import { LockedBadge } from "./plugin/lockedBadge";
import { media } from "sanity-plugin-media";
import { schemaTypes } from "./schemas";
import { structure } from "./structure";
import { defaultDocumentNode } from "./structure/defaultDocumentNode";
import { createCategoryDeleteAction } from "./actions/categoryDeleteAction";
import { createPublishWithSyncAction } from "./actions/publishWithSyncAction";

const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID || process.env.PROJECT_ID || "";
const dataset =
  process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || "";

const SINGLETON_TYPES = new Set([
  "siteSettings",
  "themeSettings",
  "navigation",
  "announcementBar",
]);

interface ProductDocument extends SanityDocument {
  categories?: Array<{
    _ref?: string;
    _type?: string;
    _key?: string;
  }>;
}

export default defineConfig({
  name: "default",
  title: "DTC E-Commerce Studio",

  projectId,
  dataset,

  basePath: "/",

  plugins: [
    structureTool({ structure, defaultDocumentNode }),
    visionTool(),
    codeInput(),
    media(),
  ],

  schema: {
    types: schemaTypes,
  },

  document: {
    /**
     * Prevents singletons from appearing in the top global "+" (Create New) menu.
     * Content editors must only access them through the configured sidebar panes.
     */
    badges: (prev, { schemaType }) => {
      // Show badge on singletons or all documents
      if (
        ["siteSettings", "themeSettings", "navigation"].includes(schemaType)
      ) {
        return [LockedBadge, ...prev];
      }
      return prev;
    },
    newDocumentOptions: (prev, { creationContext }) => {
      if (creationContext.type === "global") {
        return prev.filter(
          (template) => !SINGLETON_TYPES.has(template.templateId),
        );
      }
      return prev;
    },

    /**
     * Strips destructive actions (Delete, Duplicate, Unpublish) from singletons.
     * Prevents content editors from accidentally breaking the storefront layout.
     */
    actions: (prev, { schemaType }) => {
      if (SINGLETON_TYPES.has(schemaType)) {
        return prev.filter(
          (action) =>
            action.action !== "duplicate" &&
            action.action !== "delete" &&
            action.action !== "unpublish",
        );
      }
      if (schemaType === "category") {
        return prev.map((action) => {
          if (action.action === "delete") {
            return createCategoryDeleteAction(action);
          }
          if (action.action === "publish") {
            return createPublishWithSyncAction(action);
          }
          return action;
        });
      }

      if (schemaType === "product") {
        return prev.map((action) =>
          action.action === "publish"
            ? createPublishWithSyncAction(action)
            : action,
        );
      }

      return prev;
    },
  },

  validation: {
    async validateDocument({
      document,
    }: {
      document: SanityDocument;
      getClient: (options: { apiVersion: string }) => SanityClient;
    }) {
      if (document?._type !== "product") return [];

      const productDoc = document as ProductDocument;
      const categoriesArray = productDoc.categories;

      if (
        !categoriesArray ||
        !Array.isArray(categoriesArray) ||
        categoriesArray.length === 0
      ) {
        return [];
      }

      const targetReferences = categoriesArray
        .map((ref) => ref?._ref)
        .filter((refId): refId is string => Boolean(refId));

      const hasDraftPointers = targetReferences.some((refId: string) =>
        refId.startsWith("drafts."),
      );

      if (hasDraftPointers) {
        return [
          {
            message:
              "Category reference layers are adjusting cache streams. Click Publish again in one second.",
            path: ["categories"],
            level: "warning",
          },
        ];
      }

      return [];
    },
  },
});
