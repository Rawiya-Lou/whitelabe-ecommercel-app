import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createProductCategoriesWorkflow, updateProductCategoriesWorkflow } from "@medusajs/medusa/core-flows";
import type { Logger, MedusaContainer } from "@medusajs/framework/types";

// 1. Declare a localized structural interface covering the standard data fields we need
interface SafeSyncCategory {
  id: string;
  name: string;
  handle?: string;
  metadata?: Record<string, unknown> | null;
}

const handleCategoryMutation = async (
  categories: SafeSyncCategory[], 
  container: MedusaContainer, 
  actionType: "create" | "update"
): Promise<void> => {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const sanityToken = process.env.SANITY_API_TOKEN;
  const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID || "4vzx52ot";
  const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || "development";

  if (!sanityToken || !projectId) {
    logger.warn("[Sanity Category Sync] Integration credentials missing; skipping reverse mutations.");
    return;
  }

  for (const category of categories) {
    const metadata = (category.metadata || {}) as Record<string, unknown>;

    // 2. INFINITE LOOP GUARD: Stop execution if change originated via a Sanity webhook sync step
    if (metadata.is_sync_origin === "sanity") {
      logger.info(`[Sanity Guard] Category loop blocked for [${category.name}]. Loop avoided.`);
      continue;
    }

    const sanityId = typeof metadata.sanity_id === "string" ? metadata.sanity_id : category.id;
    const mutationUrl = `https://${projectId}.api.sanity.io/v2021-06-07/data/mutate/${encodeURIComponent(dataset)}`;
    
    let mutations: Record<string, unknown>[] = [];

    if (actionType === "create") {
      mutations = [{
        createOrReplace: {
          _id: sanityId,
          _type: "category",
          name: category.name,
          slug: { 
            _type: "slug", 
            current: category.handle || category.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") 
          }
        }
      }];
    } else if (actionType === "update") {
      mutations = [{
        patch: {
          id: sanityId,
          set: { name: category.name }
        }
      }];
    }

    try {
      const response = await fetch(mutationUrl, {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${sanityToken}`, 
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({ mutations }),
      });

      if (response.ok) {
        logger.info(`[Sanity Category Sync] Successfully pushed category ${actionType} change for [${category.name}] directly to CMS.`);
      } else {
        const errorPayload = await response.text();
        logger.error(`[Sanity Category Sync Error] Content Lake mutation rejected: ${errorPayload}`);
      }
    } catch (e) {
      logger.error(`[Category Sync Error] Outbound fetch request failed completely: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
};

createProductCategoriesWorkflow.hooks.categoriesCreated(
  async ({ categories }, { container }) => {
    // Asserting as SafeSyncCategory[] cleanly matches internal ProductCategoryDTO maps
    await handleCategoryMutation(categories as SafeSyncCategory[], container as any, "create");
    return new StepResponse(null);
  }
);

// Bind cleanly into Medusa's category updating core flow
updateProductCategoriesWorkflow.hooks.categoriesUpdated(
  async ({ categories }, { container }) => {
    // Asserting as SafeSyncCategory[] cleanly matches internal ProductCategoryDTO maps
    await handleCategoryMutation(categories as SafeSyncCategory[], container as any, "update");
    return new StepResponse(null);
  }
);
