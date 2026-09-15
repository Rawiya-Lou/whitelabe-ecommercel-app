import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import { POST } from "../route";

/**
 * Expected JSON response payload interface from the calculator API
 */
interface CalculatorSuccessResponse {
  wilaya_code: number;
  wilaya_names: {
    en: string;
    fr: string;
    ar: string;
  };
  commune_name_fr: string;
  commune_name_ar: string;
  delivery_mode: "home" | "desk";
  shipping_cost: number;
  is_overridden: boolean;
  currency_code: string;
}

interface CalculatorErrorResponse {
  message: string;
}

describe("POST /store/wilaya-calculator - Unit Test Suite", () => {
  let mockRequest: Partial<MedusaRequest>;
  let mockResponse: Partial<MedusaResponse>;
  let responseData: CalculatorSuccessResponse | CalculatorErrorResponse | null = null;
  let responseStatus: number = 200;

  const mockQueryGraph = vi.fn();
  
 
  // Create a structurally valid Logger object using standard mock functions
  const mockLogger: Logger = {
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

  beforeEach(() => {
    vi.resetAllMocks();
    responseData = null;
    responseStatus = 200;

    // Emulate a type-safe express response wrapper object
    mockResponse = {
      status: vi.fn().mockImplementation((status: number) => {
        responseStatus = status;
        return mockResponse as MedusaResponse;
      }),
      json: vi.fn().mockImplementation((data: CalculatorSuccessResponse | CalculatorErrorResponse) => {
        responseData = data;
        return mockResponse as MedusaResponse;
      }),
    };

    // Construct a type-safe Medusa DI Container mock
    const mockContainer: Partial<MedusaContainer> = {
      resolve: vi.fn().mockImplementation((key: string) => {
        if (key === ContainerRegistrationKeys.QUERY) {
          return { graph: mockQueryGraph };
        }
        if (key === ContainerRegistrationKeys.LOGGER) {
          return mockLogger;
        }
        throw new Error(`Unexpected dependency container resolution key: ${key}`);
      }),
    };

    // Map exact property structures matching MedusaRequest context criteria
    mockRequest = {
      scope: mockContainer as MedusaContainer,
      validatedBody: {
        wilaya_code: 16,
        commune_name_fr: "Sidi M'Hamed",
        commune_name_ar: "سيدي امحمد", 
        delivery_mode: "home",
      },
    };
  });

  it("should process custom Commune Overrides with higher priority (Priority 1)", async () => {
    mockQueryGraph.mockResolvedValue({
      data: [
        {
          id: "wrate_16",
          wilaya_code: 16,
          wilaya_name_en: "Algiers",
          wilaya_name_fr: "Alger",
          wilaya_name_ar: "الجزائر",
          home_price: 70000,
          desk_price: 40000,
          is_active: true,
          overrides: [
            {
              id: "com_override_1",
              commune_name_fr: "Sidi M'Hamed",
              commune_name_ar: "سيدي امحمد",
              home_delivery_price: 85000,
              stop_desk_price: 45000,
              is_active: true,
            },
          ],
        },
      ],
    });

    await POST(mockRequest as MedusaRequest, mockResponse as MedusaResponse);

      if (responseStatus === 500) {
      console.log("CRITICAL CONTROLLER ERROR TRAIL:", vi.mocked(mockLogger.error).mock.calls);
    }

    expect(responseStatus).toBe(200);
    expect(responseData).toEqual({
      wilaya_code: 16,
      wilaya_names: {
        en: "Algiers",
        fr: "Alger",
        ar: "الجزائر",
      },
      commune_name_fr: "Sidi M'Hamed",
      commune_name_ar: "سيدي امحمد",
      delivery_mode: "home",
      shipping_cost: 85000,
      is_overridden: true,
      currency_code: "dzd",
    });
  });

  it("should cleanly fall back to base Wilaya pricing models if no commune match is found (Priority 2)", async () => {
    mockQueryGraph.mockResolvedValue({
      data: [
        {
          id: "wil_16",
          wilaya_code: 16,
          wilaya_name_en: "Algiers",
          wilaya_name_fr: "Alger",
          wilaya_name_ar: "الجزائر",
          home_price: 70000,
          desk_price: 40000,
          is_active: true,
          overrides: [
            {
              id: "com_override_2",
              commune_name_fr: "Bab El Oued",
              commune_name_ar: "باب الواد",
              home_delivery_price: 60000,
              stop_desk_price: 35000,
              is_active: true,
            },
          ],
        },
      ],
    });

    await POST(mockRequest as MedusaRequest, mockResponse as MedusaResponse);

    const successResult = responseData as CalculatorSuccessResponse;
    expect(responseStatus).toBe(200);
    expect(successResult.shipping_cost).toBe(70000);
    expect(successResult.is_overridden).toBe(false);
  });

  it("should return a clean 404 response payload if the incoming Wilaya code is offline or missing", async () => {
    mockQueryGraph.mockResolvedValue({ data: [] });

    await POST(mockRequest as MedusaRequest, mockResponse as MedusaResponse);

    const errorResult = responseData as CalculatorErrorResponse;
    expect(responseStatus).toBe(404);
    expect(errorResult.message).toContain("Fulfillment metrics for Wilaya code 16 are unavailable.");
  });

  it("should safely intercept fatal runtime database drops, outputting log diagnostics and clear 500 codes", async () => {
    const databaseError = new Error("Neon Serverless connection pooling timeout");
    mockQueryGraph.mockRejectedValue(databaseError);

    await POST(mockRequest as MedusaRequest, mockResponse as MedusaResponse);

    const errorResult = responseData as CalculatorErrorResponse;
    expect(responseStatus).toBe(500);
    expect(errorResult.message).toBe("An internal database query exception collapsed calculation sub-pipelines.");
    
    // Use vi.mocked() locally to wrap your object assertions without namespace compile errors
    expect(vi.mocked(mockLogger.error)).toHaveBeenCalledWith(
      expect.stringContaining("[WILAYA_CALCULATOR_API_CRASH]: Neon Serverless connection pooling timeout"),
      databaseError
    );
  });
});
