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
  levelExistedInitially: boolean;
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

    // Fetch existing mapping parameters
    const [level] = await inventoryModuleService.listInventoryLevels({
      inventory_item_id: [input.inventoryItemId],
      location_id: [input.stockLocationId],
    });

    const levelExistedInitially = !!level;
    const previousQty = level?.stocked_quantity ?? 0;

    if (!levelExistedInitially) {
      // Create the missing row if an old broken run skipped it
      logger.info(
        `[Sanity Sync] Item [${input.inventoryItemId}] not yet stocked at Location [${input.stockLocationId}]. Initializing level configuration row.`
      );
      
      await inventoryModuleService.createInventoryLevels([
        {
          inventory_item_id: input.inventoryItemId,
          location_id: input.stockLocationId,
          stocked_quantity: input.stockedQuantity,
        },
      ]);
    } else {
      // Standard safe update runtime lane
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
    }

    return new StepResponse(
      { success: true },
      {
        itemId: input.inventoryItemId,
        locationId: input.stockLocationId,
        previousQty,
        levelExistedInitially,
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

    if (!compensateContext.levelExistedInitially) {
      // If this step built the row, delete it entirely to clean up the DB
      logger.warn(
        `[Workflow Rollback] Downstream failure encountered. Purging newly initialized stock row index.`
      );
      try {
        await inventoryModuleService.deleteInventoryLevel(
          compensateContext.itemId,
          compensateContext.locationId
        );
      } catch (error) {
        logger.error(`[Workflow Rollback] Safe level purge skip: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      // Symmetrical restoration loop
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
    }
  },
);
