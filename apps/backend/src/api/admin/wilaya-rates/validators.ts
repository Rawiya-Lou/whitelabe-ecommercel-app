import { z } from "@medusajs/framework/zod"

export const adminWilayaRateUpsertSchema = z.object({
  wilaya_code: z.number().int().min(1).max(69),
  desk_price: z.number().int().nonnegative(),
  home_price: z.number().int().nonnegative(),
  region_id: z.string(),
})

export type AdminWilayaRateUpsertType = z.infer<typeof adminWilayaRateUpsertSchema>
