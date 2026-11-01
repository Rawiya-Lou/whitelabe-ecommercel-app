import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { syncProductToSanityStep } from "./steps/sync-product-to-sanity-step";
import { deleteProductFromSanityStep } from "./steps/delete-product-from-sanity-step";

export const syncProductToSanityWorkflow = createWorkflow(
  "sync-product-to-sanity",
  (input: { productId: string }) => {
    const res = syncProductToSanityStep(input.productId);
    return new WorkflowResponse(res);
  }
);

export const deleteProductFromSanityWorkflow = createWorkflow(
  "delete-product-from-sanity",
  (input: { productId: string }) => {
    const res = deleteProductFromSanityStep(input.productId);
    return new WorkflowResponse(res);
  }
);