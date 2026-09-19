import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
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
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const inventoryModuleService = container.resolve(Modules.INVENTORY);

    // Concurrently verify both product handles and inventory item variants
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "variants.id", "variants.sku"],
      filters: { handle: [input.productSlug.toLowerCase().trim()] },
    });

    const product = products?.[0];
    const [inventoryItem] = await inventoryModuleService.listInventoryItems({
      sku: input.variantSku.trim(),
    });

    const variantId = product?.variants?.[0]?.id;
    logger.info(`Inspection Matrix: Product Exists = ${!!product} | Inventory Item Exists = ${!!inventoryItem}`);


    return new StepResponse({
      productExists: !!product,
      productId: product?.id,
      inventoryItemId: inventoryItem?.id,
      variantId,
    });
  },
);
