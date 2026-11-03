import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import {
  SyncCategoryInput,
  syncCategoryFromSanityStep,
} from "./steps/sync-category-from-sanity";

export const sanitySyncCategoryWorkflow = createWorkflow(
  "sanity-sync-category",
  (input: SyncCategoryInput) =>
    new WorkflowResponse(syncCategoryFromSanityStep(input)),
);
