import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

interface LinkVariantInventoryInput {
  variantId: string;
  inventoryItemId: string;
  stockLocationId?: string; // Accept parent values cleanly
  stockedQuantity?: number; // Accept parent values cleanly
}

interface LinkVariantInventoryCompensation {
  variantId: string;
  inventoryItemId: string;
  stockLocationId?: string;
}

export const linkVariantToInventoryStep = createStep(
  "link-variant-to-inventory",
  async (
    input: LinkVariantInventoryInput,
    { container },
  ): Promise<
    StepResponse<{ success: boolean }, LinkVariantInventoryCompensation>
  > => {
    const remoteLink = container.resolve(ContainerRegistrationKeys.LINK);
    const inventoryModuleService = container.resolve(Modules.INVENTORY);

    // Safely unpack values inside the execution block context
    await remoteLink.create([
      {
        [Modules.PRODUCT]: { variant_id: input.variantId },
        [Modules.INVENTORY]: { inventory_item_id: input.inventoryItemId },
      },
    ]);

    if (input.stockLocationId) {
      await inventoryModuleService.createInventoryLevels([
        {
          inventory_item_id: input.inventoryItemId,
          location_id: input.stockLocationId,
          stocked_quantity: input.stockedQuantity ?? 0,
        },
      ]);
    }

    return new StepResponse(
      { success: true },
      {
        variantId: input.variantId,
        inventoryItemId: input.inventoryItemId,
        stockLocationId: input.stockLocationId,
      },
    );
  },
  async (compensateInput, { container }) => {
    if (!compensateInput) return;
    const remoteLink = container.resolve(ContainerRegistrationKeys.LINK);
    const inventoryModuleService = container.resolve(Modules.INVENTORY);

    // 5. Compensation: Break down the linked tracking configuration dynamically
    await remoteLink.dismiss([
      {
        [Modules.PRODUCT]: { variant_id: compensateInput.variantId },
        [Modules.INVENTORY]: {
          inventory_item_id: compensateInput.inventoryItemId,
        },
      },
    ]);
  },
);
