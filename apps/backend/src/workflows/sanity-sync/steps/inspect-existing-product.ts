import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

interface InspectInput {
  handle: string;
  sku: string;
}

export interface InspectionResult {
  exists: boolean;
  productId?: string;
  inventoryItemId?: string;
}

export const inspectExistingProductStep = createStep(
  "inspect-existing-product",
  async (input: InspectInput, { container }): Promise<StepResponse<InspectionResult>> => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);

    // Concurrently verify both product handles and inventory item variants
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "handle"],
      filters: { handle: input.handle },
    });

    const { data: inventoryItems } = await query.graph({
      entity: "inventory_item",
      fields: ["id", "sku"],
      filters: { sku: input.sku },
    });

    const existingProduct = products?.[0];
    const existingInventory = inventoryItems?.[0];

    return new StepResponse({
      exists: !!existingProduct,
      productId: existingProduct?.id,
      inventoryItemId: existingInventory?.id,
    });
  }
);
