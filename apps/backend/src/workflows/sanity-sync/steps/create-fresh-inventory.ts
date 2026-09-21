// apps/backend/src/workflows/sanity-sync/steps/create-fresh-inventory.ts
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { IInventoryService, Logger } from "@medusajs/framework/types";

interface CreateFreshInventoryInput {
  inventoryItemExists: boolean;
  preexistingInventoryItemId: string;
  sku: string;
  title: string;
  stockLocationId: string;
  quantity: number;
  originCountry?: string;
}

interface CreateFreshInventoryOutput {
  inventoryItemId: string;
  wasCreated: boolean;
}

export const createFreshInventoryStep = createStep(
  "create-fresh-inventory",
  async (input: CreateFreshInventoryInput, { container }) => {
    const inventoryService = container.resolve(Modules.INVENTORY) as IInventoryService;
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

    // 💡 IDEMPOTENCY GUARD 1: Check upstream structural input conditions
    if (input.inventoryItemExists && input.preexistingInventoryItemId) {
      logger.info(`[Sanity Sync] Reusing pre-existing inventory entry for SKU: [${input.sku}]`);
      return new StepResponse<CreateFreshInventoryOutput>({
        inventoryItemId: input.preexistingInventoryItemId,
        wasCreated: false
      });
    }

    // 💡 IDEMPOTENCY GUARD 2: Query the real database by SKU right before mutating to prevent unique key violations
    const [existingItemBySku] = await inventoryService.listInventoryItems({ sku: [input.sku] });
    
    if (existingItemBySku) {
      logger.info(`[Sanity Sync] SKU [${input.sku}] found in database during pre-write validation. Syncing quantity balances.`);
      
      // Update the quantity instead of trying to create a duplicate row
      await inventoryService.updateInventoryLevels([
        {
          inventory_item_id: existingItemBySku.id,
          location_id: input.stockLocationId,
          stocked_quantity: input.quantity,
        }
      ]);

      return new StepResponse<CreateFreshInventoryOutput>({
        inventoryItemId: existingItemBySku.id,
        wasCreated: false
      });
    }

    logger.info(`[Sanity Sync] Spawning new inventory ledger entry row for SKU: [${input.sku}]`);

    // 💡 FIXED: Uses lightweight direct module insertion instead of heavy nested sub-workflows
    const createdItems = await inventoryService.createInventoryItems([
      {
        sku: input.sku,
        title: input.title,
        requires_shipping: true,
        origin_country: input.originCountry
      }
    ]);

    // Extract the created array object record cleanly using Medusa v2 standards
    const inventoryItemId = createdItems[0].id;

    await inventoryService.createInventoryLevels([
      {
        inventory_item_id: inventoryItemId,
        location_id: input.stockLocationId,
        stocked_quantity: input.quantity,
      }
    ]);

    return new StepResponse<CreateFreshInventoryOutput>(
      { inventoryItemId, wasCreated: true },
      { inventoryItemId, wasCreated: true } 
    );
  },
  
  async (compensateData, { container }) => {
    if (!compensateData || !compensateData.wasCreated) return;

    const inventoryService = container.resolve(Modules.INVENTORY) as IInventoryService;
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

    logger.warn(`[Workflow Rollback] Purging newly created inventory item ID: [${compensateData.inventoryItemId}] due to downstream failure.`);
    await inventoryService.deleteInventoryItems([compensateData.inventoryItemId]);
  }
);
