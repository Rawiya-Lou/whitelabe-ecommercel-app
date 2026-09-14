import { describe, it, expect } from "vitest"
import { adminWilayaRateUpsertSchema } from "../validators"

describe("Admin Wilaya Rate Upsert Schema Validation", () => {
  it("should pass for valid structural data bounds", () => {
    const validData = {
      wilaya_code: 16, // Algiers
      desk_price: 25000,
      home_price: 45000,
      region_id: "reg_123"
    }
    const result = adminWilayaRateUpsertSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  it("should fail when wilaya_code exceeds the 69 reform boundary", () => {
    const invalidData = {
      wilaya_code: 70, // Max allowed is 69
      desk_price: 25000,
      home_price: 45000,
      region_id: "reg_123"
    }
    const result = adminWilayaRateUpsertSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  it("should fail when pricing parameters are negative numbers", () => {
    const invalidData = {
      wilaya_code: 31,
      desk_price: -100, // Negative pricing is invalid
      home_price: 45000,
      region_id: "reg_123"
    }
    const result = adminWilayaRateUpsertSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })
})
