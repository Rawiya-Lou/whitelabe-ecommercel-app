import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MockedFunction } from "vitest";
import {
  MedusaError,
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils";
import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { ALGERIAN_LOGISTICS_MODULE } from "../../../modules/algerian-logistics";

const mockGeo = vi.hoisted(() => ({
  wilayas: [
    { code: "1", name: "Adrar", name_ar: "أدرار", name_fr: "Adrar" },
    { code: "59", name: "Aflou", name_ar: "أفلو", name_fr: "Aflou" },
  ],
}));

vi.mock("../geo-loader", () => ({
  loadGeoWilayas: () => mockGeo.wilayas,
}));

import { seedWilayasStepHandler } from "../steps";

interface MockLogisticsService {
  listWilayaRates: MockedFunction<
    (filters: { wilaya_code: number }) => Promise<Array<{ id: string }>>
  >;
  createWilayaRates: MockedFunction<
    (payload: Record<string, unknown>) => Promise<{ id: string }>
  >;
}

interface MockRegionService {
  listAndCountRegions: MockedFunction<
    (
      filters: Record<string, unknown>
    ) => Promise<[Array<{ id: string }>, number]>
  >;
  createRegions: MockedFunction<
    (payload: Record<string, unknown>) => Promise<Array<{ id: string }>>
  >;
}

describe("seedWilayasStepHandler", () => {
  let mockLogger: Logger;
  let mockModuleService: MockLogisticsService;
  let mockRegionService: MockRegionService;
  let mockContainer: MedusaContainer;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGeo.wilayas = [
      { code: "1", name: "Adrar", name_ar: "أدرار", name_fr: "Adrar" },
      { code: "59", name: "Aflou", name_ar: "أفلو", name_fr: "Aflou" },
    ];

    mockLogger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      progress: vi.fn(),
      setLogLevel: vi.fn(),
      activity: vi.fn(),
      failure: vi.fn(),
      success: vi.fn(),
      log: vi.fn(),
      panic: vi.fn(),
      shouldLog: vi.fn(),
      unsetLogLevel: vi.fn(),
      silly: vi.fn(),
      verbose: vi.fn(),
      http: vi.fn(),
    };

    mockModuleService = {
      listWilayaRates: vi.fn().mockResolvedValue([]),
      createWilayaRates: vi.fn().mockResolvedValue({ id: "wrate_123" }),
    };

    mockRegionService = {
      listAndCountRegions: vi.fn().mockResolvedValue([[], 0]),
      createRegions: vi.fn().mockResolvedValue([{ id: "reg_dzd_123" }]),
    };

    mockContainer = {
      resolve: vi.fn().mockImplementation((key: string) => {
        if (key === ContainerRegistrationKeys.LOGGER) return mockLogger;
        if (key === Modules.REGION || key === "regionService") {
          return mockRegionService;
        }
        if (key === ALGERIAN_LOGISTICS_MODULE) return mockModuleService;
        return mockModuleService;
      }),
    } as unknown as MedusaContainer;
  });

  it("creates DZD region if missing and seeds new wilayas with major DZD units & mother codes", async () => {
    const response = await seedWilayasStepHandler(
      {},
      { container: mockContainer }
    );

    expect(mockRegionService.listAndCountRegions).toHaveBeenCalledTimes(1);
    expect(mockRegionService.createRegions).toHaveBeenCalledWith({
      name: "Algeria",
      currency_code: "dzd",
      countries: ["dz"],
    });
    expect(mockModuleService.listWilayaRates).toHaveBeenCalledTimes(2);
    expect(mockModuleService.createWilayaRates).toHaveBeenCalledTimes(2);

    expect(mockModuleService.createWilayaRates).toHaveBeenNthCalledWith(1, {
      wilaya_code: 1,
      mother_wilaya_code: null,
      wilaya_name_en: "Adrar",
      wilaya_name_fr: "Adrar",
      wilaya_name_ar: "أدرار",
      home_price: 700,
      desk_price: 400,
      is_active: true,
      region_id: "reg_dzd_123",
    });

    expect(mockModuleService.createWilayaRates).toHaveBeenNthCalledWith(2, {
      wilaya_code: 59,
      mother_wilaya_code: 3,
      wilaya_name_en: "Aflou",
      wilaya_name_fr: "Aflou",
      wilaya_name_ar: "أفلو",
      home_price: 700,
      desk_price: 400,
      is_active: true,
      region_id: "reg_dzd_123",
    });

    expect(response).toBeInstanceOf(StepResponse);
    expect(response.output).toEqual({
      success: true,
      count: 2,
    });
    expect(mockLogger.info).toHaveBeenCalled();
  });

  it("skips creation if a wilaya already exists in the database", async () => {
    mockRegionService.listAndCountRegions.mockResolvedValue([
      [{ id: "reg_dzd_existing" }],
      1,
    ]);
    mockModuleService.listWilayaRates
      .mockResolvedValueOnce([{ id: "existing_1" }])
      .mockResolvedValueOnce([]);

    const response = await seedWilayasStepHandler(
      {},
      { container: mockContainer }
    );

    expect(mockRegionService.createRegions).not.toHaveBeenCalled();
    expect(mockModuleService.createWilayaRates).toHaveBeenCalledTimes(1);
    expect(response.output).toEqual({
      success: true,
      count: 1,
    });
  });

  it("throws MedusaError loudly when geoalgeria dataset is empty", async () => {
    mockGeo.wilayas = [];

    await expect(
      seedWilayasStepHandler({}, { container: mockContainer })
    ).rejects.toThrow(MedusaError);
  });

  it("propagates database errors instead of swallowing them", async () => {
    mockModuleService.listWilayaRates.mockRejectedValue(
      new MedusaError(MedusaError.Types.DB_ERROR, "Database connection failed")
    );

    await expect(
      seedWilayasStepHandler({}, { container: mockContainer })
    ).rejects.toThrow("Database connection failed");
  });
});