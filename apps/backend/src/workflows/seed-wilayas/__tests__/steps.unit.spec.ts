import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MockedFunction } from "vitest";
import fs from "fs";
import path from "path";
import { MedusaError, ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { seedWilayasStepHandler } from "../steps";

vi.mock("fs");
vi.mock("path");

interface QueryGraphPayload {
  data: Array<{ id: string }>;
}

interface MockModuleService {
  createWilayaRates: MockedFunction<(payload: unknown[]) => Promise<Array<{ id: string }>>>;
}

interface MockRegionService {
  listAndCountRegions: MockedFunction<(filters: Record<string, unknown>) => Promise<[Array<{ id: string }>, number]>>;
  createRegions: MockedFunction<(payload: Record<string, unknown>) => Promise<Array<{ id: string }>>>;
}

describe("seedWilayasStepHandler", () => {
  let mockDbService: { graph: MockedFunction<() => Promise<QueryGraphPayload>> };
  let mockLogger: Logger;
  let mockModuleService: MockModuleService;
  let mockRegionService: MockRegionService;
  let mockContainer: MedusaContainer;

  const mockWilayasData = [
    { code: "1", name: "Adrar", name_ar: "أدرار", name_fr: "Adrar" },
    { code: "2", name: "Chlef", name_ar: "الشلف", name_fr: "Chlef" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockDbService = {
      graph: vi.fn().mockResolvedValue({ data: [] }),
    };

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

    // Updated to match the array response return type of the generated MedusaService method
    mockModuleService = {
      createWilayaRates: vi.fn().mockResolvedValue([{ id: "rec_123" }]),
    };

    // Corrected to accurately return a tuple structure [regionsArray, count]
    mockRegionService = {
      listAndCountRegions: vi.fn().mockResolvedValue([[], 0]), 
      createRegions: vi.fn().mockResolvedValue([{ id: "reg_dzd_123" }]),
    };

    mockContainer = {
      resolve: vi.fn().mockImplementation((key: string) => {
        if (key === ContainerRegistrationKeys.QUERY) return mockDbService;
        if (key === ContainerRegistrationKeys.LOGGER) return mockLogger;
        if (key === Modules.REGION || key === "regionService") return mockRegionService;
        return mockModuleService; 
      }),
    } as unknown as MedusaContainer;

    const mockedPathJoin = path.join as MockedFunction<typeof path.join>;
    const mockedFsExistsSync = fs.existsSync as MockedFunction<typeof fs.existsSync>;
    const mockedFsReadFileSync = fs.readFileSync as MockedFunction<typeof fs.readFileSync>;

    mockedPathJoin.mockReturnValue("/mocked/path/wilayas.json");
    mockedFsExistsSync.mockReturnValue(true);
    mockedFsReadFileSync.mockReturnValue(JSON.stringify(mockWilayasData));
  });

  it("successfully seeds new wilayas when they do not exist", async () => {
    const response = await seedWilayasStepHandler({}, { container: mockContainer });

    expect(fs.existsSync).toHaveBeenCalled();
    expect(fs.readFileSync).toHaveBeenCalled();
    expect(mockRegionService.listAndCountRegions).toHaveBeenCalledTimes(1);
    expect(mockRegionService.createRegions).toHaveBeenCalledTimes(1);
    expect(mockDbService.graph).toHaveBeenCalledTimes(2);
    expect(mockModuleService.createWilayaRates).toHaveBeenCalledTimes(2);
    
    expect(response).toBeInstanceOf(StepResponse);
    expect(response.output).toEqual({
      success: true,
      count: 2,
    });
    expect(mockLogger.info).toHaveBeenCalled();
  });

  it("skips creation if the wilaya already exists in the database", async () => {
    mockDbService.graph
      .mockResolvedValueOnce({ data: [{ id: "existing_1" }] })
      .mockResolvedValueOnce({ data: [] });

    const response = await seedWilayasStepHandler({}, { container: mockContainer });

    expect(mockModuleService.createWilayaRates).toHaveBeenCalledTimes(1);
    expect(response.output).toEqual({
      success: true,
      count: 1,
    });
  });

  it("returns failure step response when data file does not exist", async () => {
    const mockedFsExistsSync = fs.existsSync as MockedFunction<typeof fs.existsSync>;
    mockedFsExistsSync.mockReturnValue(false);

    const response = await seedWilayasStepHandler({}, { container: mockContainer });

    expect(mockLogger.error).toHaveBeenCalled();
    expect(response.output).toEqual({
      success: false,
      count: 0,
    });
  });

  it("handles unexpected runtime crashes gracefully and logs MedusaError", async () => {
    const dbError = new MedusaError(MedusaError.Types.DB_ERROR, "Database connection failed");
    mockDbService.graph.mockRejectedValue(dbError);

    const response = await seedWilayasStepHandler({}, { container: mockContainer });

    expect(mockLogger.error).toHaveBeenCalled();
    expect(response.output).toEqual({
      success: false,
      count: 0,
    });
  });
});
