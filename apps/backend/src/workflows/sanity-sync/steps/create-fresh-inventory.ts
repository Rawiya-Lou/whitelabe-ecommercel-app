import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { IInventoryService, Logger } from "@medusajs/framework/types";
import { 
  createInventoryItemsWorkflow, 
  createInventoryLevelsWorkflow 
} from "@medusajs/medusa/core-flows";

interface CreateFreshInventoryInput {
  inventoryItemExists: boolean;
  preexistingInventoryItemId: string;
  sku: string;
  title: string;
  stockLocationId: string;
  quantity: number;
}

interface CreateFreshInventoryOutput {
  inventoryItemId: string;
  wasCreated: boolean;
}

export const createFreshInventoryStep = createStep(
  "create-fresh-inventory",
  async (input: CreateFreshInventoryInput, { container }) => {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

    if (input.inventoryItemExists) {
      logger.info(`[Sanity Sync] Reusing pre-existing inventory entry for SKU: [${input.sku}]`);
      return new StepResponse<CreateFreshInventoryOutput>({
        inventoryItemId: input.preexistingInventoryItemId,
        wasCreated: false
      });
    }

    logger.info(`[Sanity Sync] Spawning new inventory entry for SKU: [${input.sku}]`);

    const { result: createdItems } = await createInventoryItemsWorkflow(container).run({
      input: {
        items: [
          {
            sku: input.sku,
            title: input.title,
            requires_shipping: true,
          }
        ]
      }
    });

    const inventoryItemId = createdItems[0].id;
    await createInventoryLevelsWorkflow(container).run({
      input: {
        inventory_levels: [
          {
            inventory_item_id: inventoryItemId,
            location_id: input.stockLocationId,
            stocked_quantity: input.quantity,
          }
        ]
      }
    });

    return new StepResponse<CreateFreshInventoryOutput>(
      { inventoryItemId, wasCreated: true },
      { inventoryItemId, wasCreated: true } 
    );
  },
  
  async (compensateData, { container }) => {
    if (!compensateData || !compensateData.wasCreated) return;

    const inventoryModuleService = container.resolve(Modules.INVENTORY) as IInventoryService;
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

    logger.warn(`[Workflow Rollback] Purging newly created inventory item ID: [${compensateData.inventoryItemId}] due to downstream failure.`);
    await inventoryModuleService.deleteInventoryItems([compensateData.inventoryItemId]);
  }
);
