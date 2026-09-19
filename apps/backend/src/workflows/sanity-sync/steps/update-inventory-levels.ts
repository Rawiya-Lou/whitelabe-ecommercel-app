import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";

interface UpdateInventoryLevelInput {
  inventoryItemId: string;
  stockLocationId: string;
  stockedQuantity: number;
}

interface InventoryLevelsResponse {
  itemId: string;
  locationId: string;
  previousQty: number;
}

export const updateInventoryLevelsStep = createStep(
  "update-inventory-levels",
  async (
    input: UpdateInventoryLevelInput,
    { container },
  ): Promise<StepResponse<{success: boolean}, InventoryLevelsResponse>> => {
    const inventoryModuleService = container.resolve(Modules.INVENTORY);

    // Fetch the current level matrix to preserve rollback integrity
    const [level] = await inventoryModuleService.listInventoryLevels({
      inventory_item_id: [input.inventoryItemId],
      location_id: [input.stockLocationId],
    });

    const previousQty = level?.stocked_quantity ?? 0;

    // Medusa v2 Inventory Module level updates use direct location_id mappings
    await inventoryModuleService.updateInventoryLevels({
      inventory_item_id: input.inventoryItemId,
      location_id: input.stockLocationId,
      stocked_quantity: input.stockedQuantity,
    });

    return new StepResponse({success: true}, {
      itemId: input.inventoryItemId,
      locationId: input.stockLocationId,
      previousQty,
    });
  },
  async (compensateContext, { container }) => {
    if (!compensateContext) return;
    const inventoryModuleService = container.resolve(Modules.INVENTORY);

    // Automatically revert the quantity value if subsequent workflow events crash
    await inventoryModuleService.updateInventoryLevels({
      inventory_item_id: compensateContext.itemId,
      location_id: compensateContext.locationId,
      stocked_quantity: compensateContext.previousQty,
    });
  },
);
