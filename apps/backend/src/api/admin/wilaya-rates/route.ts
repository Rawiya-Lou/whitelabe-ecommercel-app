import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import upsertWilayaRateWorkflow from "../../../workflows/upsert-wilaya-rate"
import type { AdminWilayaRateUpsertType } from "./validators"

export async function POST(
  req: AuthenticatedMedusaRequest<AdminWilayaRateUpsertType>,
  res: MedusaResponse
): Promise<void> {
  // Execute the standard workflow using req.scope
  const { result } = await upsertWilayaRateWorkflow(req.scope).run({
    input: req.validatedBody
  })

  // Destructure result payload returned by WorkflowResponse
  res.status(result.status).json({ wilaya_rate: result.wilaya_rate })
}
