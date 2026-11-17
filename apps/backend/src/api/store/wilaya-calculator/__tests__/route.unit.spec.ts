import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { POST } from "../route";
import { ALGERIAN_LOGISTICS_MODULE } from "../../../../modules/algerian-logistics";

describe("POST /store/wilaya-calculator", () => {
  const mockResolveDeliveryQuote = vi.fn();
  const mockListWilayaRates = vi.fn();
  const mockLogger = { error: vi.fn() };

  const makeReq = (body: Record<string, unknown>) =>
    ({
      validatedBody: body,
      scope: {
        resolve: vi.fn((key: string) => {
          if (key === ALGERIAN_LOGISTICS_MODULE) {
            return {
              resolveDeliveryQuote: mockResolveDeliveryQuote,
              listWilayaRates: mockListWilayaRates,
            };
          }
          if (key === ContainerRegistrationKeys.LOGGER) return mockLogger;
          return null;
        }),
      },
    }) as any;

  const makeRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with server-resolved DZD shipping cost and carrier fallback code", async () => {
    mockResolveDeliveryQuote.mockResolvedValue({
      wilaya_code: 59,
      carrier_wilaya_code: 3,
      delivery_mode: "home",
      amount: 900,
      currency_code: "dzd",
    });
    mockListWilayaRates.mockResolvedValue([
      {
        wilaya_name_en: "Aflou",
        wilaya_name_fr: "Aflou",
        wilaya_name_ar: "أفلو",
      },
    ]);

    const res = makeRes();
    await POST(
      makeReq({
        wilaya_code: 59,
        commune_name_fr: "Aflou",
        commune_name_ar: "أفلو",
        delivery_mode: "home",
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        wilaya_code: 59,
        carrier_wilaya_code: 3,
        shipping_cost: 900,
        currency_code: "dzd",
      })
    );
  });

  it("returns 400 when wilaya or commune is disabled", async () => {
    mockResolveDeliveryQuote.mockRejectedValue(
      new MedusaError(MedusaError.Types.INVALID_DATA, "Delivery disabled")
    );

    const res = makeRes();
    await POST(
      makeReq({
        wilaya_code: 16,
        commune_name_fr: "Disabled",
        delivery_mode: "home",
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Delivery disabled" });
  });

  it("returns sanitized 500 without leaking raw DB errors", async () => {
    mockResolveDeliveryQuote.mockRejectedValue(
      new Error("ECONNREFUSED postgres://secret@neon.tech/db")
    );

    const res = makeRes();
    await POST(
      makeReq({
        wilaya_code: 16,
        commune_name_fr: "Alger Centre",
        delivery_mode: "desk",
      }),
      res
    );

    expect(mockLogger.error).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Unable to calculate delivery quote.",
    });
  });
});