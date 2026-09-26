import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { IInventoryService, Logger } from "@medusajs/framework/types";
import { ProductInspectionDTO } from "../types";

interface InspectInput {
  productSlug: string;
  variantSku: string;
}

export const inspectExistingProductStep = createStep(
  "inspect-existing-product",
  async (
    input: InspectInput,
    { container },
  ): Promise<StepResponse<ProductInspectionDTO>> => {
    const logger = container.resolve(
      ContainerRegistrationKeys.LOGGER,
    ) as Logger;
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const inventoryModuleService = container.resolve(
      Modules.INVENTORY,
    ) as IInventoryService;

    const normalizedSlug = input.productSlug.toLowerCase().trim();
    const normalizedSku = input.variantSku.trim();

    let productId: string | undefined;
    let variantId: string | undefined;
    let productExists = false;

    // Core Lookup Pass: Query Graph engine by handle slug
    const { data: productsBySlug } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "variants.id", "variants.sku"],
      filters: { handle: [normalizedSlug] },
    });

    if (productsBySlug && productsBySlug.length > 0) {
      const product = productsBySlug[0];
      productExists = true;
      productId = product.id;
      variantId = product.variants?.[0]?.id;
    }

    // Orphan Protection Pass: If not found by slug, search directly by Variant SKU
    if (!productExists && normalizedSku) {
      const { data: variantsBySku } = await query.graph({
        entity: "product_variant",
        fields: ["id", "sku", "product.id"],
        filters: { sku: [normalizedSku] },
      });

      if (variantsBySku && variantsBySku.length > 0) {
        const foundVariant = variantsBySku[0];
        variantId = foundVariant.id;
        productId = foundVariant.product?.id;
        productExists = !!productId; // Becomes an update if a parent product is linked

        logger.info(
          `[Sanity Sync Guard] Orphaned variant detected for SKU [${normalizedSku}]. Safely healing database reference routing map.`,
        );
      }
    }

    // Resolve Inventory ledger tracking item independently
    const [inventoryItem] = normalizedSku
      ? await inventoryModuleService.listInventoryItems({
          sku: [normalizedSku],
        })
      : [];

    logger.info(
      `[Sanity Sync] Inspection Matrix for [${normalizedSlug}]: Product Exists = ${productExists} | Inventory Item Exists = ${!!inventoryItem}`,
    );

    return new StepResponse<ProductInspectionDTO>({
      productExists,
      productId,
      inventoryItemId: inventoryItem?.id,
      variantId,
    });
  },
);
