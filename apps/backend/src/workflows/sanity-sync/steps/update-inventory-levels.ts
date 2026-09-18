import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";

interface UpdateInventoryLevelInput {
  inventoryItemId: string;
  locationId: string;
  stockedQuantity: number;
}

export const updateInventoryLevelsStep = createStep(
  "update-inventory-levels",
  async (input: UpdateInventoryLevelInput, { container }) => {
    const inventoryModuleService = container.resolve(Modules.INVENTORY);

    // Fetch the current level matrix to preserve rollback integrity
    const [currentLevel] = await inventoryModuleService.listInventoryLevels({
      inventory_item_id: input.inventoryItemId,
      location_id: input.locationId,
    });

    // Medusa v2 Inventory Module level updates use direct location_id mappings
    await inventoryModuleService.updateInventoryLevels({
      inventory_item_id: input.inventoryItemId,
      location_id: input.locationId,
      stocked_quantity: input.stockedQuantity,
    });

    return new StepResponse(
      { success: true },
      {
        inventoryItemId: input.inventoryItemId,
        locationId: input.locationId,
        previousQuantity: currentLevel?.stocked_quantity ?? 0,
      }
    );
  },
  async (compensateInput, { container }) => {
    if (!compensateInput) return;
    const inventoryModuleService = container.resolve(Modules.INVENTORY);
    
    // Automatically revert the quantity value if subsequent workflow events crash
    await inventoryModuleService.updateInventoryLevels({
      inventory_item_id: compensateInput.inventoryItemId,
      location_id: compensateInput.locationId,
      stocked_quantity: compensateInput.previousQuantity,
    });
  }
);
