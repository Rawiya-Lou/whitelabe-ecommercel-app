// apps/backend/src/workflows/sanity-sync/steps/create-fresh-inventory.ts
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
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

export const createFreshInventoryStep = createStep(
  "create-fresh-inventory",
  async (input: CreateFreshInventoryInput, { container }) => {
    // If the inventory item was found during our pre-execution check, exit early and return its ID
    if (input.inventoryItemExists) {
      return new StepResponse({
        inventoryItemId: input.preexistingInventoryItemId,
        wasCreated: false
      });
    }

    // Invoke core workflows manually via the container inside the custom step block
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

    // Allocate initial inventory levels safely for the fresh asset
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

    return new StepResponse({
      inventoryItemId,
      wasCreated: true
    });
  }
);
