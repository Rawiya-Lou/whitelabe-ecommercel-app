import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { deleteCategoryFromSanityStep } from "./steps/delete-category-from-sanity-step";
import { syncCategoryToSanityStep } from "./steps/sync-category-to-sanity-step";

export const syncCategoryToSanityWorkflow = createWorkflow(
  "sync-category-to-sanity",
  (input: { categoryId: string }) =>
    new WorkflowResponse(syncCategoryToSanityStep(input.categoryId)),
);

export const deleteCategoryFromSanityWorkflow = createWorkflow(
  "delete-category-from-sanity",
  (input: { categoryId: string }) =>
    new WorkflowResponse(deleteCategoryFromSanityStep(input.categoryId)),
);
