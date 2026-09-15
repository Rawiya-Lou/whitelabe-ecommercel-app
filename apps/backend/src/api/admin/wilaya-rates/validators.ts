import { z } from "@medusajs/framework/zod"

export const adminCommuneOverrideSchema = z.object({
  id: z.string().optional(), // Provided if updating an existing override
  commune_name_fr: z.string().min(1),
  commune_name_ar: z.string().min(1),
  home_delivery_price: z.number().int().nonnegative(), // Converted to bigNumber by Medusa
  stop_desk_price: z.number().int().nonnegative(),    // Converted to bigNumber by Medusa
  is_active: z.boolean().default(true),
})
export const adminWilayaRateUpsertSchema = z.object({
  wilaya_code: z.number().int().min(1).max(69),
  wilaya_name_fr: z.string().min(1),
  wilaya_name_ar: z.string().min(1),
  wilaya_name_en: z.string(),
  desk_price: z.number().int().nonnegative(),
  home_price: z.number().int().nonnegative(),
  region_id: z.string(),
  delivery_center_id: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
overrides: z.array(adminCommuneOverrideSchema).optional(),
})


export type AdminWilayaRateUpsertType = z.infer<typeof adminWilayaRateUpsertSchema>
export type AdminCommuneOverrideType = z.infer<typeof adminCommuneOverrideSchema>
