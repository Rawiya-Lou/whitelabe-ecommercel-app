import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { syncInventoryMaterialToProductStep } from "./steps/sync-inventory-material-to-product-step";

export const syncInventoryMaterialToProductWorkflow = createWorkflow(
  "sync-inventory-material-to-product",
  (input: { inventoryItemId: string }) =>
    new WorkflowResponse(syncInventoryMaterialToProductStep(input)),
);
