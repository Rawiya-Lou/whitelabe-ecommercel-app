import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { IInventoryService, Logger } from "@medusajs/framework/types";

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
  ): Promise<StepResponse<{ success: boolean }, InventoryLevelsResponse>> => {
    const inventoryModuleService = container.resolve(
      Modules.INVENTORY,
    ) as IInventoryService;
    const logger = container.resolve(
      ContainerRegistrationKeys.LOGGER,
    ) as Logger;

    const [level] = await inventoryModuleService.listInventoryLevels({
      inventory_item_id: [input.inventoryItemId],
      location_id: [input.stockLocationId],
    });

    const previousQty = level?.stocked_quantity ?? 0;

    logger.info(
      `[Sanity Sync] Adjusting inventory levels for Item [${input.inventoryItemId}] at Location [${input.stockLocationId}]. Delta: ${previousQty} -> ${input.stockedQuantity}`,
    );

    await inventoryModuleService.updateInventoryLevels([
      {
        inventory_item_id: input.inventoryItemId,
        location_id: input.stockLocationId,
        stocked_quantity: input.stockedQuantity,
      },
    ]);

    return new StepResponse(
      { success: true },
      {
        itemId: input.inventoryItemId,
        locationId: input.stockLocationId,
        previousQty,
      },
    );
  },
  async (compensateContext, { container }) => {
    if (!compensateContext) return;
    const inventoryModuleService = container.resolve(
      Modules.INVENTORY,
    ) as IInventoryService;
    const logger = container.resolve(
      ContainerRegistrationKeys.LOGGER,
    ) as Logger;

    logger.warn(
      `[Workflow Rollback] Reverting stock layout to previous state: ${compensateContext.previousQty}`,
    );

    await inventoryModuleService.updateInventoryLevels([
      {
        inventory_item_id: compensateContext.itemId,
        location_id: compensateContext.locationId,
        stocked_quantity: compensateContext.previousQty,
      },
    ]);
  },
);
