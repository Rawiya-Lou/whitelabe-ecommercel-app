import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { Logger } from "@medusajs/framework/types";
import { SANITY_MODULE } from "../../../modules/sanity-sync";
import SanityModuleService from "../../../modules/sanity-sync/service";
import { MedusaVariantInput } from "../../../modules/sanity-sync/types";

interface ProductWithVariants {
  id: string;
  metadata?: Record<string, unknown> | null;
  variants?: Array<
    MedusaVariantInput & { metadata?: Record<string, unknown> | null }
  > | null;
}

interface SyncVariantsStepInput {
  productId: string;
  afterProductSync: unknown;
}

interface SyncVariantsStepResult {
  success: boolean;
  changed: boolean;
  reason?: string;
  variantCount: number;
}

export const syncVariantsToSanityStep = createStep(
  "sync-variants-to-sanity",
  async (
    { productId }: SyncVariantsStepInput,
    { container },
  ): Promise<StepResponse<SyncVariantsStepResult>> => {
    const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const sanityService =
      container.resolve<SanityModuleService>(SANITY_MODULE);

    try {
      const { data: products } = await query.graph({
        entity: "product",
        fields: [
          "id",
          "metadata",
          "variants.id",
          "variants.title",
          "variants.sku",
          "variants.options.value",
          "variants.options.option.title",
          "variants.metadata",
        ],
        filters: { id: productId },
      });
      const product = products?.[0] as ProductWithVariants | undefined;
      if (!product) {
        return new StepResponse({
          success: false,
          changed: false,
          reason: "product_not_found",
          variantCount: 0,
        });
      }

      const sanityDocId =
        typeof product.metadata?.sanity_id === "string"
          ? product.metadata.sanity_id
          : product.id;
      const result = await sanityService.syncProductVariants(
        sanityDocId,
        (product.variants ?? []).map((variant) => ({
          ...variant,
          sanity_variant_id:
            typeof variant.metadata?.sanity_variant_id === "string"
              ? variant.metadata.sanity_variant_id
              : undefined,
        })),
      );

      if (result.reason === "unchanged") {
        logger.info(
          "[Sanity Variant Sync] No structural changes detected; patch skipped.",
        );
      }

      return new StepResponse({
        success: result.reason !== "locked",
        changed: result.changed,
        reason: result.reason === "locked" ? "sync_lock_unavailable" : undefined,
        variantCount: result.variantCount,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown Sanity sync failure";
      logger.error(
        `[Sanity Variant Sync] Failed to synchronize variants for product ${productId}: ${message}`,
      );
      return new StepResponse({
        success: false,
        changed: false,
        reason:
          error instanceof MedusaError
            ? error.message
            : "sanity_variant_sync_failed",
        variantCount: 0,
      });
    }
  },
);
