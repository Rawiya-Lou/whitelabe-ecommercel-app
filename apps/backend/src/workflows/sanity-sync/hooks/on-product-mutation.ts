import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  createProductsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import type { Logger, MedusaContainer } from "@medusajs/framework/types";

interface SafeSyncProduct {
  id: string;
  title: string;
  handle?: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}

const handleProductMutation = async (
  products: SafeSyncProduct[],
  container: MedusaContainer,
  actionType: "create" | "update",
): Promise<void> => {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const sanityToken = process.env.SANITY_API_TOKEN;
  const projectId =
    process.env.SANITY_PROJECT_ID ||
    process.env.SANITY_STUDIO_PROJECT_ID ||
    "4vzx52ot";
  const dataset =
    process.env.SANITY_DATASET ||
    process.env.SANITY_STUDIO_DATASET ||
    "development";

  if (!sanityToken || !projectId) {
    logger.warn(
      "[Sanity Product Sync] Integration credentials missing; skipping reverse mutations.",
    );
    return;
  }

  for (const product of products) {
    const metadata = (product.metadata || {}) as Record<string, unknown>;

    // INFINITE LOOP GUARD: If this update came FROM Sanity originally, STOP HERE.
    if (metadata.is_sync_origin === "sanity") {
      logger.info(
        `[Sanity Sync Guard] Product mutation for [${product.id}] originated from Sanity. Loop blocked.`,
      );
      continue;
    }

    // Determine target Sanity document ID
    const sanityId =
      typeof metadata.sanity_id === "string" ? metadata.sanity_id : product.id;

    const mutationUrl = `https://${projectId}.api.sanity.io/v2021-06-07/data/mutate/${encodeURIComponent(dataset)}`;

    let mutations: Record<string, unknown>[] = [];
    const localizedTitle = {
      _type: "localizedString",
      en: product.title || "",
    };

    const localizedDescription = {
      _type: "localizedString",
      en: product.description || "",
    };

    if (actionType === "create") {
      // Create a brand new document in Sanity
      mutations = [
        {
          createOrReplace: {
            _id: sanityId,
            _type: "product",
            title: localizedTitle,
            description: localizedDescription || "",
            _updatedBy: "medusa",
            slug: {
              _type: "slug",
              current:
                product.handle ||
                product.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            },
          },
        },
      ];
    } else if (actionType === "update") {
      // Patch an existing document in Sanity
      mutations = [
        {
          patch: {
            id: sanityId,
            set: {
              title: localizedTitle,
              description: localizedDescription || "",
              _updatedBy: "medusa",
            },
          },
        },
        {
          patch: {
            id: sanityId,
            unset: ["_updatedBy"],
          },
        },
      ];
    }

    try {
      const response = await fetch(mutationUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sanityToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mutations }),
      });

      if (response.ok) {
        logger.info(
          `[Sanity Sync Success] Synchronized product ${actionType} for [${product.title}] back to Sanity.`,
        );
      } else {
        const errorPayload = await response.text();
        logger.error(
          `[Sanity Product Sync Error] Content Lake mutation rejected: ${errorPayload}`,
        );
      }
    } catch (error) {
      logger.error(
        `[Sanity Sync Failure] Could not push product data back to Sanity: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
};

// Bind to Medusa v2 Creation Core Flow
createProductsWorkflow.hooks.productsCreated(
  async ({ products }, { container }) => {
    // Explicit parameter typing via explicit destructured args
    await handleProductMutation(
      products as SafeSyncProduct[],
      container as any,
      "create",
    );
    return new StepResponse(null);
  },
);

// Bind to Medusa v2 Update Core Flow
updateProductsWorkflow.hooks.productsUpdated(
  async ({ products }, { container }) => {
    // Explicit parameter typing via explicit destructured args
    await handleProductMutation(
      products as SafeSyncProduct[],
      container as any,
      "update",
    );
    return new StepResponse(null);
  },
);
