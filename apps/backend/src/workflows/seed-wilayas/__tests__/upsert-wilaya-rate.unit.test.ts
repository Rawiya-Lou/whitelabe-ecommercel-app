import { describe, it, expect, vi, beforeEach } from "vitest";
import { Modules, ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { ALGERIAN_LOGISTICS_MODULE } from "../../../modules/algerian-logistics";

const mockGeo = vi.hoisted(() => ({
  wilayas: [
    { code: 16, name_fr: "Alger", name_ar: "الجزائر" },
    { code: 59, name_fr: "Aflou", name_ar: "أفلو" },
  ],
}));

vi.mock("../geo-loader", () => ({
  loadGeoWilayas: () => mockGeo.wilayas,
}));

import { upsertWilayaRateStepHandler } from "../upsert-wilaya-rate";

describe("Wilaya Seed & Upsert Workflow Steps", () => {
  const mockLogisticsService = {
    listWilayaRates: vi.fn(),
    createWilayaRates: vi.fn(),
    updateWilayaRates: vi.fn(),
    listCommuneOverrides: vi.fn(),
    deleteCommuneOverrides: vi.fn(),
    createCommuneOverrides: vi.fn(),
    retrieveWilayaRate: vi.fn(),
  };

  const mockRegionService = {
    listAndCountRegions: vi.fn(),
    createRegions: vi.fn(),
  };

  const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  const mockContainer = {
    resolve: vi.fn((key: string) => {
      if (key === ALGERIAN_LOGISTICS_MODULE) return mockLogisticsService;
      if (key === Modules.REGION) return mockRegionService;
      if (key === ContainerRegistrationKeys.LOGGER) return mockLogger;
      return null;
    }),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGeo.wilayas = [
      { code: 16, name_fr: "Alger", name_ar: "الجزائر" },
      { code: 59, name_fr: "Aflou", name_ar: "أفلو" },
    ];
  });

  
  it("upsertWilayaRateStepHandler clears stale overrides when overrides: [] is passed", async () => {
    mockLogisticsService.listWilayaRates.mockResolvedValue([{ id: "wrate_16" }]);
    mockLogisticsService.updateWilayaRates.mockResolvedValue({ id: "wrate_16" });
    mockLogisticsService.listCommuneOverrides.mockResolvedValue([
      { id: "com_override_1" },
      { id: "com_override_2" },
    ]);
    mockLogisticsService.retrieveWilayaRate.mockResolvedValue({
      id: "wrate_16",
      overrides: [],
    });

    const res = await upsertWilayaRateStepHandler(
      {
        wilaya_code: 16,
        wilaya_name_fr: "Alger",
        wilaya_name_ar: "الجزائر",
        wilaya_name_en: "Algiers",
        home_price: 650,
        desk_price: 350,
        region_id: "reg_dz",
        is_active: true,
        overrides: [],
      },
      { container: mockContainer }
    );

    expect(mockLogisticsService.deleteCommuneOverrides).toHaveBeenCalledWith([
      "com_override_1",
      "com_override_2",
    ]);
    expect(mockLogisticsService.createCommuneOverrides).not.toHaveBeenCalled();
    expect(res).toMatchObject({ output: { status: 200 } });
  });

  it("upsertWilayaRateStepHandler saves commune_name_ar and normalized commune_key", async () => {
    mockLogisticsService.listWilayaRates.mockResolvedValue([]);
    mockLogisticsService.createWilayaRates.mockResolvedValue({ id: "wrate_59" });
    mockLogisticsService.listCommuneOverrides.mockResolvedValue([]);
    mockLogisticsService.retrieveWilayaRate.mockResolvedValue({
      id: "wrate_59",
      overrides: [{ commune_name_ar: "أفلو" }],
    });

    await upsertWilayaRateStepHandler(
      {
        wilaya_code: 59,
        wilaya_name_fr: "Aflou",
        wilaya_name_ar: "أفلو",
        wilaya_name_en: "Aflou",
        home_price: 900,
        desk_price: 600,
        region_id: "reg_dz",
        is_active: true,
        overrides: [
          {
            commune_name_fr: "Sidi M'Hamed",
            commune_name_en: "Sidi M'Hamed",
            commune_name_ar: "سيدي امحمد",
            home_delivery_price: 850,
            stop_desk_price: 500,
            is_active: true,
          },
        ],
      },
      { container: mockContainer }
    );

    expect(mockLogisticsService.createWilayaRates).toHaveBeenCalledWith(
      expect.objectContaining({ mother_wilaya_code: 3 })
    );
    expect(mockLogisticsService.createCommuneOverrides).toHaveBeenCalledWith([
      expect.objectContaining({
        commune_name_fr: "Sidi M'Hamed",
        commune_name_ar: "سيدي امحمد",
        commune_key: "sidi m hamed",
        wilaya_rate_id: "wrate_59",
      }),
    ]);
  });
});