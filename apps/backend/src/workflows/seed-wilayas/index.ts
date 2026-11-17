import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { seedWilayasStep } from "./steps";

export const seedWilayasWorkflow = createWorkflow(
  "seed-wilayas",
  (_input: Record<string, unknown>) => {
    const result = seedWilayasStep({});
    return new WorkflowResponse(result);
  }
);

export default seedWilayasWorkflow;