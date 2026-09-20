import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { IInventoryService, Logger } from "@medusajs/framework/types";

interface LinkVariantInventoryInput {
  variantId: string;
  inventoryItemId: string;
  stockLocationId?: string;
  stockedQuantity?: number;
}

interface LinkVariantInventoryCompensation {
  variantId: string;
  inventoryItemId: string;
  stockLocationId?: string;
  levelCreatedByThisStep: boolean; 
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
    const inventoryModuleService = container.resolve(
      Modules.INVENTORY,
    ) as IInventoryService;
    const logger = container.resolve(
      ContainerRegistrationKeys.LOGGER,
    ) as Logger;

    logger.info(
      `[Sanity Sync] Binding Variant [${input.variantId}] to Inventory Item [${input.inventoryItemId}]`,
    );

    await remoteLink.create([
      {
        [Modules.PRODUCT]: { variant_id: input.variantId },
        [Modules.INVENTORY]: { inventory_item_id: input.inventoryItemId },
      },
    ]);

    let levelCreatedByThisStep = false;

    if (input.stockLocationId) {
      const [existingLevel] = await inventoryModuleService.listInventoryLevels({
        inventory_item_id: [input.inventoryItemId],
        location_id: [input.stockLocationId],
      });

      if (!existingLevel) {
        logger.info(`[Sanity Sync] Initializing fresh stock level under Location: [${input.stockLocationId}]`);
        await inventoryModuleService.createInventoryLevels([
          {
            inventory_item_id: input.inventoryItemId,
            location_id: input.stockLocationId,
            stocked_quantity: input.stockedQuantity ?? 0,
          },
        ]);
        levelCreatedByThisStep = true;
      } else {
        logger.info(`[Sanity Sync] Inventory level already exists for Item [${input.inventoryItemId}] at Location [${input.stockLocationId}]. Syncing quantities instead.`);
        await inventoryModuleService.updateInventoryLevels([
          {
            inventory_item_id: input.inventoryItemId,
            location_id: input.stockLocationId,
            stocked_quantity: input.stockedQuantity ?? 0,
          }
        ]);
      }
    }

    return new StepResponse(
      { success: true },
      {
        variantId: input.variantId,
        inventoryItemId: input.inventoryItemId,
        stockLocationId: input.stockLocationId,
        levelCreatedByThisStep, // 💡 FIXED: Injected tracking value to satisfy structural type requirement
      },
    );
  },

  async (compensateInput, { container }) => {
    if (!compensateInput) return;

    const remoteLink = container.resolve(ContainerRegistrationKeys.LINK);
    const inventoryModuleService = container.resolve(
      Modules.INVENTORY,
    ) as IInventoryService;
    const logger = container.resolve(
      ContainerRegistrationKeys.LOGGER,
    ) as Logger; // 💡 FIXED: Cleaned up duplicate duplicate code line declarations

    logger.warn(
      `[Workflow Rollback] Downstream fault detected. Reversing inventory relationship bindings.`,
    );

    // Only purge the level matrix index if it was built during this single execution block
    if (compensateInput.stockLocationId && compensateInput.levelCreatedByThisStep) {
      try {
        // 💡 FIXED: Symmetrical positional argument placement matrix matching framework layout specs
        await inventoryModuleService.deleteInventoryLevel(
          compensateInput.inventoryItemId,
          compensateInput.stockLocationId,
        );
      } catch (error) {
        logger.error(
          `[Workflow Rollback] Safe level deletion skip or fail: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    await remoteLink.dismiss([
      {
        [Modules.PRODUCT]: { variant_id: compensateInput.variantId },
        [Modules.INVENTORY]: {
          inventory_item_id: compensateInput.inventoryItemId,
        },
      },
    ]);

    logger.info(`[Workflow Rollback] Symmetrical linkage breakdown complete.`);
  },
);
