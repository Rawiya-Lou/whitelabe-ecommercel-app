import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route";
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ALGERIAN_LOGISTICS_MODULE } from "../../../../modules/algerian-logistics";

const { mockListWilayaRates, mockLoggerError } = vi.hoisted(() => {
  return {
    mockListWilayaRates: vi.fn<() => Promise<unknown>>(),
    mockLoggerError: vi.fn(),
  };
});

describe("Medusa v2 Store API Route - Custom Algerian Wilaya Rates (/store/wilaya-rates)", () => {
  // Setup standard reusable mock request and response container stubs
  let mockReq: Partial<MedusaRequest>;
  let mockRes: Partial<MedusaResponse>;
  let responseData: unknown = null;
  let responseStatus = 200;

  beforeEach(() => {
    vi.clearAllMocks();
    responseData = null;
    responseStatus = 200;

    // Mock response handler methods
    mockRes = {
      status: vi.fn().mockImplementation((code: number) => {
        responseStatus = code;
        return mockRes;
      }),
      json: vi.fn().mockImplementation((data: unknown) => {
        responseData = data;
        return mockRes;
      }),
    };

    // Initialize the type-safe dependency container container mappings
    mockReq = {
      query: {},
      scope: {
        resolve: vi.fn().mockImplementation((key: string) => {
          if (key === ALGERIAN_LOGISTICS_MODULE) {
            return {
              listWilayaRates: mockListWilayaRates,
            };
          }
          if (key === "logger") {
            return {
              error: mockLoggerError,
            };
          }
          throw new Error(`Unexpected dependency request token lookup: ${key}`);
        }),
      } as unknown as MedusaRequest["scope"],
    };
  });

  it("should return the full list registry block array when no query parameters are passed", async () => {
    const mockRatesMatrix = [
      { id: "wrate_1", wilaya_code: 16, desk_price: 35000, home_price: 45000, region_id: "reg_dz" },
      { id: "wrate_2", wilaya_code: 31, desk_price: 40000, home_price: 55000, region_id: "reg_dz" },
    ];
    mockListWilayaRates.mockResolvedValueOnce(mockRatesMatrix);

    await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

    expect(responseStatus).toBe(200);
    expect(responseData).toEqual({ wilaya_rates: mockRatesMatrix });
    expect(mockListWilayaRates).toHaveBeenCalledWith();
  });


  it("should perform a precise filtered lookup when a valid numerical wilaya code is passed", async () => {
    mockReq.query = { wilaya_code: "16" };
    const mockSingleRate = [
      { id: "wrate_1", wilaya_code: 16, desk_price: 35000, home_price: 45000, region_id: "reg_dz" },
    ];
    mockListWilayaRates.mockResolvedValueOnce(mockSingleRate);

    await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

    expect(responseStatus).toBe(200);
    expect(responseData).toEqual({ wilaya_rate: mockSingleRate[0] });
    expect(mockListWilayaRates).toHaveBeenCalledWith({ wilaya_code: 16 });
  });


  it("should return 400 validation rejection error if wilaya_code parameter sits outside range boundary limits", async () => {
    mockReq.query = { wilaya_code: "73" }; // Invalid (Algeria modern max is 69)

    await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

    expect(responseStatus).toBe(400);
    expect(responseData).toHaveProperty("message");
    expect(mockListWilayaRates).not.toHaveBeenCalled();
  });

  it("should gracefully capture connection drop faults and output a 500 error code log to protect layout integrity", async () => {
    mockReq.query = { wilaya_code: "16" };
    mockListWilayaRates.mockRejectedValueOnce(new Error("Neon Serverless Database Instance Context Refused."));

    await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

    expect(responseStatus).toBe(500);
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
