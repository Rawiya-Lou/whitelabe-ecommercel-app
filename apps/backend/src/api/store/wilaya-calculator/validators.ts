import { z } from "@medusajs/framework/zod"

export const CalculateShippingSchema = z.object({
  wilaya_code: z.number().min(1).max(69), // Aligned with the geoalgeria 69-wilaya reform
  commune_name_fr: z.string().min(2),     // Must match geoalgeria's French string formatting
  commune_name_ar: z.string().min(2),     // Must match geoalgeria's French string formatting
  delivery_mode: z.enum(["home", "desk"]), // 'home' for door delivery, 'desk' for delivery Stop-Desk pick-up
})

export type CalculateShippingInput = z.infer<typeof CalculateShippingSchema>
