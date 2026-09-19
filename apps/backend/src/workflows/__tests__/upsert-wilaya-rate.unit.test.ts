import { describe, it, expect, vi } from "vitest"
import upsertWilayaRateWorkflow from "../seed-wilayas/upsert-wilaya-rate"
import { ALGERIAN_LOGISTICS_MODULE } from "../../../src/modules/algerian-logistics"
import { createContainer, asValue } from "awilix"
import type { MedusaContainer } from "@medusajs/framework/types"

describe("Upsert Wilaya Rate Workflow Execution Unit", () => {
  it("should run the insertion pipeline successfully when no existing records are found", async () => {
    // 1. Setup mock returns covering all internal service invocations
    const mockLogisticsService = {
      listWilayaRates: vi.fn().mockResolvedValue([]),
      createWilayaRates: vi.fn().mockResolvedValue({ id: "wrate_abc" }),
      updateWilayaRates: vi.fn(),
      listCommuneOverrides: vi.fn().mockResolvedValue([]),
      deleteCommuneOverrides: vi.fn().mockResolvedValue([]),
      createCommuneOverrides: vi.fn().mockResolvedValue([]),
      retrieveWilayaRate: vi.fn().mockResolvedValue({
        id: "wrate_abc",
        wilaya_code: 16,
        wilaya_name_fr: "Alger",
        wilaya_name_ar: "الجزائر",
        overrides: []
      }),
    }

    const container = createContainer()

    container.register({
      [ALGERIAN_LOGISTICS_MODULE]: asValue(mockLogisticsService),
      AlgerianLogisticsModuleService: asValue(mockLogisticsService),
      logger: asValue({
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      }),
    })

    // 2. Execute the workflow passing valid structured parameters
    const { result } = await upsertWilayaRateWorkflow(
      container as unknown as MedusaContainer
    ).run({
      input: {
        wilaya_code: 16,
        wilaya_name_fr: "Alger",
        wilaya_name_en: "Algiers",
        wilaya_name_ar: "الجزائر",
        desk_price: 30000,
        home_price: 50000,
        region_id: "reg_1",
        is_active: true,
        overrides: []
      },
    })

    // 3. Structural boundary assertions
    expect(mockLogisticsService.listWilayaRates).toHaveBeenCalledWith({
      wilaya_code: 16,
    })
    expect(mockLogisticsService.createWilayaRates).toHaveBeenCalledWith({
      wilaya_code: 16,
      wilaya_name_fr: "Alger",
      wilaya_name_ar: "الجزائر",
      wilaya_name_en: "Algiers",
      desk_price: 30000,
      home_price: 50000,
      region_id: "reg_1",
      is_active: true,
    })
    expect(mockLogisticsService.retrieveWilayaRate).toHaveBeenCalledWith("wrate_abc", {
      relations: ["overrides"],
    })
    
    expect(result.status).toBe(201)
    expect(result.wilaya_rate.id).toBe("wrate_abc")
  })

  it("should run the update pipeline successfully and refresh overrides when record already exists", async () => {
    const mockLogisticsService = {
      listWilayaRates: vi.fn().mockResolvedValue([{ id: "wrate_existing" }]),
      createWilayaRates: vi.fn(),
      updateWilayaRates: vi.fn().mockResolvedValue({ id: "wrate_existing" }),
      listCommuneOverrides: vi.fn().mockResolvedValue([{ id: "com_old_1" }]),
      deleteCommuneOverrides: vi.fn().mockResolvedValue([]),
      createCommuneOverrides: vi.fn().mockResolvedValue([]),
      retrieveWilayaRate: vi.fn().mockResolvedValue({
        id: "wrate_existing",
        wilaya_code: 16,
        overrides: [{ commune_name_fr: "Zeralda", home_delivery_price: 40000 }]
      }),
    }

    const container = createContainer()

    container.register({
      [ALGERIAN_LOGISTICS_MODULE]: asValue(mockLogisticsService),
      logger: asValue({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
    })

    const { result } = await upsertWilayaRateWorkflow(
      container as unknown as MedusaContainer
    ).run({
      input: {
        wilaya_code: 16,
        wilaya_name_fr: "Alger",
        wilaya_name_ar: "الجزائر",
        wilaya_name_en: "Algiers",
        desk_price: 35000,
        home_price: 55000,
        region_id: "reg_1",
        is_active: true,

        overrides: [
          {
            commune_name_fr: "Zeralda",
            commune_name_ar: "زرالدة",
            home_delivery_price: 40000,
            stop_desk_price: 20000,
            is_active: true
          }
        ]
      },
    })

    // Assert validation sequence execution
    expect(mockLogisticsService.updateWilayaRates).toHaveBeenCalledWith({
      id: "wrate_existing",
      wilaya_code: 16,
      wilaya_name_fr: "Alger",
      wilaya_name_ar: "الجزائر",
      wilaya_name_en: "Algiers",
      desk_price: 35000,
      home_price: 55000,
      region_id: "reg_1",
      is_active: true,
    })
    expect(mockLogisticsService.deleteCommuneOverrides).toHaveBeenCalledWith(["com_old_1"])
    expect(mockLogisticsService.createCommuneOverrides).toHaveBeenCalledWith([
      {
        commune_name_fr: "Zeralda",
        home_delivery_price: 40000,
        stop_desk_price: 20000,
        is_active: true,
        wilaya_rate_id: "wrate_existing",
      }
    ])
    
    expect(result.status).toBe(200)
    expect(result.wilaya_rate.id).toBe("wrate_existing")
  })
})
