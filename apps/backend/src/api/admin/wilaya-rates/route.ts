import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import upsertWilayaRateWorkflow from "../../../workflows/seed-wilayas/upsert-wilaya-rate"
import { adminWilayaRateUpsertSchema } from "./validators"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {

  const validatedData = adminWilayaRateUpsertSchema.parse(req.body)
  const { result } = await upsertWilayaRateWorkflow(req.scope).run({
    input: validatedData
  })
  res.status(result.status).json({ 
    wilaya_rate: result.wilaya_rate 
  })
}
