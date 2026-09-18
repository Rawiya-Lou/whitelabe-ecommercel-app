import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

interface LinkVariantInventoryInput {
  variantId: string;
  inventoryItemId: string;
}

export const linkVariantToInventoryStep = createStep(
  "link-variant-to-inventory",
  async (input: LinkVariantInventoryInput, { container }) => {
    // Resolve the internal system remote link manager
    const remoteLink = container.resolve(ContainerRegistrationKeys.LINK);

    // Create a precise relationship link across module boundaries
    await remoteLink.create([
      {
        [Modules.PRODUCT]: { variant_id: input.variantId },
        [Modules.INVENTORY]: { inventory_item_id: input.inventoryItemId },
      },
    ]);

    return new StepResponse(
      { success: true },
      { variantId: input.variantId, inventoryItemId: input.inventoryItemId },
    );
  },
  async (compensateInput, { container }) => {
    if (!compensateInput) return;
    const remoteLink = container.resolve(ContainerRegistrationKeys.LINK);

    // Rollback utility: Dismiss link mappings automatically on database transactional failures
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
