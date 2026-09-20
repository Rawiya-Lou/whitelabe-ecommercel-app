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
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const inventoryModuleService = container.resolve(Modules.INVENTORY) as IInventoryService;

    const normalizedSlug = input.productSlug.toLowerCase().trim();
    const normalizedSku = input.variantSku.trim();
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "variants.id", "variants.sku"],
      filters: { handle: [normalizedSlug] },
    });

    const product = products?.[0];
    
    const [inventoryItem] = normalizedSku 
      ? await inventoryModuleService.listInventoryItems({ sku: [normalizedSku] })
      : [];

    const variantId = product?.variants?.[0]?.id;
    
    logger.info(
      `[Sanity Sync] Inspection Matrix for [${normalizedSlug}]: Product Exists = ${!!product} | Inventory Item Exists = ${!!inventoryItem}`
    );

    return new StepResponse<ProductInspectionDTO>({
      productExists: !!product,
      productId: product?.id,
      inventoryItemId: inventoryItem?.id,
      variantId,
    });
  },
);
