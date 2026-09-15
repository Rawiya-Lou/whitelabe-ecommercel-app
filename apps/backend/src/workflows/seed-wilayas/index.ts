import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { seedWilayasStep } from "./steps";

export const seedWilayasWorkflow = createWorkflow(
  "seed-wilayas",
  () => {
    const result = seedWilayasStep({});
    
    return new WorkflowResponse(result);
  }
);
