import { describe, it, expect } from "vitest"
import { adminWilayaRateUpsertSchema } from "../validators"

describe("Admin Wilaya Rate Upsert Schema Validation", () => {
  it("should pass for valid structural data bounds with minimal required properties", () => {
    const validData = {
      wilaya_code: 16, // Algiers
      wilaya_name_fr: "Alger",
      wilaya_name_ar: "الجزائر",
      wilaya_name_en: "Algiers",
      desk_price: 25000,
      home_price: 45000,
      region_id: "reg_123",
    }
    const result = adminWilayaRateUpsertSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  it("should pass when fully populated with optional localized strings, center IDs, and commune overrides", () => {
    const fullyPopulatedData = {
      wilaya_code: 31, // Oran
      wilaya_name_fr: "Oran",
      wilaya_name_ar: "وهران",
      wilaya_name_en: "Oran",
      desk_price: 30000,
      home_price: 50000,
      region_id: "reg_123",
      delivery_center_id: "7b049d56-42d7-4df3-bc32-ea217b12b322", // Valid string syntax
      is_active: true,
      overrides: [
        {
          commune_name_fr: "Bousfer",
          commune_name_ar: "بوسفر",
          home_delivery_price: 55000, // Premium route markup fee
          stop_desk_price: 35000,
          is_active: true,
        },
      ],
    }
    const result = adminWilayaRateUpsertSchema.safeParse(fullyPopulatedData)
    expect(result.success).toBe(true)
  })

  it("should fail when mandatory translation labels are missing or empty strings", () => {
    const invalidData = {
      wilaya_code: 16,
      wilaya_name_fr: "", // Should fail .min(1) boundary check
      wilaya_name_ar: "الجزائر",
      wilaya_name_en: "Algiers",
      desk_price: 25000,
      home_price: 45000,
      region_id: "reg_123",
    }
    const result = adminWilayaRateUpsertSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  it("should fail when wilaya_code exceeds the 69 reform boundary", () => {
    const invalidData = {
      wilaya_code: 70, // Max structural limit is bounded at 69
      wilaya_name_fr: "Unknown",
      wilaya_name_ar: "غير معروف",
      wilaya_name_en: "Unknown",
      desk_price: 25000,
      home_price: 45000,
      region_id: "reg_123",
    }
    const result = adminWilayaRateUpsertSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  it("should fail when pricing parameters are negative numbers", () => {
    const invalidData = {
      wilaya_code: 31,
      wilaya_name_fr: "Oran",
      wilaya_name_ar: "وهران",
      wilaya_name_en: "Oran",
      desk_price: -100, // Negative pricing is invalid via .nonnegative()
      home_price: 45000,
      region_id: "reg_123",
    }
    const result = adminWilayaRateUpsertSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  it("should fail when nested commune override attributes break validation requirements", () => {
    const invalidNestedData = {
      wilaya_code: 16,
      wilaya_name_fr: "Alger",
      wilaya_name_ar: "الجزائر",
      wilaya_name_en: "Algiers",
      desk_price: 25000,
      home_price: 45000,
      region_id: "reg_123",
      overrides: [
        {
          commune_name_fr: "", // Invalid empty name string boundary
          commune_name_ar: "", // Invalid empty name string boundary
          home_delivery_price: -500, // Invalid negative calculation asset bound
          stop_desk_price: 20000,
        },
      ],
    }
    const result = adminWilayaRateUpsertSchema.safeParse(invalidNestedData)
    expect(result.success).toBe(false)
  })
})
