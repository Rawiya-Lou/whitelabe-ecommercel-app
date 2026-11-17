import { describe, it, expect, vi, beforeEach } from "vitest";
import { MedusaError } from "@medusajs/framework/utils";
import AlgerianFulfillmentProviderService from "../service";
import { ALGERIAN_LOGISTICS_MODULE } from "../../algerian-logistics";

describe("AlgerianFulfillmentProviderService", () => {
  const mockResolveDeliveryQuote = vi.fn();
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  const makeService = () =>
    new AlgerianFulfillmentProviderService({
      logger: mockLogger as any,
      [ALGERIAN_LOGISTICS_MODULE]: {
        resolveDeliveryQuote: mockResolveDeliveryQuote,
      } as any,
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("supports calculated shipping options", async () => {
    const service = makeService();
    expect(await service.canCalculate({} as any)).toBe(true);
    expect(await service.validateOption({ delivery_mode: "home" })).toBe(true);
    expect(await service.validateOption({ delivery_mode: "desk" })).toBe(true);
    expect(await service.validateOption({ delivery_mode: "invalid" })).toBe(false);
  });

  it("calculates authoritative DZD price from AlgerianLogisticsModuleService", async () => {
    mockResolveDeliveryQuote.mockResolvedValue({
      wilaya_code: 16,
      carrier_wilaya_code: 16,
      delivery_mode: "home",
      amount: 800,
      currency_code: "dzd",
    });

    const service = makeService();
    const price = await service.calculatePrice(
      { delivery_mode: "home" },
      { wilaya_code: 16, commune_name_fr: "Zéralda" },
      {} as any
    );

    expect(mockResolveDeliveryQuote).toHaveBeenCalledWith({
      wilaya_code: 16,
      commune_name_fr: "Zéralda",
      delivery_mode: "home",
    });
    expect(price).toEqual({
      calculated_amount: 800,
      is_calculated_price_tax_inclusive: true,
    });
  });

  it("returns safe preview amount when cart has no wilaya selected yet", async () => {
    const service = makeService();
    const price = await service.calculatePrice(
      { delivery_mode: "desk" },
      {},
      {} as any
    );

    expect(mockResolveDeliveryQuote).not.toHaveBeenCalled();
    expect(price.calculated_amount).toBe(400);
  });

  it("rejects invalid wilaya_code in validateFulfillmentData", async () => {
    const service = makeService();

    await expect(
      service.validateFulfillmentData(
        { delivery_mode: "home" },
        { wilaya_code: 99 },
        {} as any
      )
    ).rejects.toThrow(MedusaError);
  });

  it("propagates disabled commune rejection from resolveDeliveryQuote", async () => {
    mockResolveDeliveryQuote.mockRejectedValue(
      new MedusaError(MedusaError.Types.INVALID_DATA, "Delivery disabled")
    );

    const service = makeService();

    await expect(
      service.validateFulfillmentData(
        { delivery_mode: "home" },
        { wilaya_code: 16, commune_name_fr: "DisabledCommune" },
        {} as any
      )
    ).rejects.toThrow("Delivery disabled");
  });
});