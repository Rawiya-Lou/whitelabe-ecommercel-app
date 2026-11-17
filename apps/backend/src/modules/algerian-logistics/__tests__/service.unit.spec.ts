import { describe, it, expect, vi, beforeEach } from "vitest";
import { MedusaError } from "@medusajs/framework/utils";
import AlgerianLogisticsModuleService from "../service";
import {
  MOTHER_WILAYA_CODES,
  WILAYA_ENGLISH_NAMES,
  normalizeLocationKey,
} from "../constants";

describe("Algerian Logistics Constants & Normalization", () => {
  it("contains all 69 official Algerian wilayas with accurate 49-69 mappings", () => {
    for (let code = 1; code <= 69; code++) {
      expect(WILAYA_ENGLISH_NAMES[code]).toBeTruthy();
    }
    expect(WILAYA_ENGLISH_NAMES[49]).toBe("Timimoun");
    expect(WILAYA_ENGLISH_NAMES[50]).toBe("Bordj Badji Mokhtar");
    expect(WILAYA_ENGLISH_NAMES[58]).toBe("El Meniaa");
    expect(WILAYA_ENGLISH_NAMES[59]).toBe("Aflou");
    expect(WILAYA_ENGLISH_NAMES[69]).toBe("El Abiodh Sidi Cheikh");

    expect(MOTHER_WILAYA_CODES[59]).toBe(3);
    expect(MOTHER_WILAYA_CODES[69]).toBe(32);
  });

  it("normalizes French diacritics, apostrophes, hyphens, and extra spaces", () => {
    expect(normalizeLocationKey("Zéralda")).toBe("zeralda");
    expect(normalizeLocationKey("Sidi M'Hamed")).toBe(
      normalizeLocationKey("Sidi M’Hamed")
    );
    expect(normalizeLocationKey("  Aïn-Témouchent  ")).toBe("ain temouchent");
  });
});

describe("AlgerianLogisticsModuleService.resolveDeliveryQuote", () => {
  let service: AlgerianLogisticsModuleService;
  let listWilayaRatesMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = Object.create(AlgerianLogisticsModuleService.prototype);
    listWilayaRatesMock = vi.fn();
    (service as unknown as { listWilayaRates: typeof listWilayaRatesMock }).listWilayaRates =
      listWilayaRatesMock;
  });

  it("returns base home/desk DZD rates for an active standard wilaya", async () => {
    listWilayaRatesMock.mockResolvedValue([
      {
        wilaya_code: 16,
        mother_wilaya_code: null,
        home_price: 700,
        desk_price: 400,
        is_active: true,
        overrides: [],
      },
    ]);

    const homeQuote = await service.resolveDeliveryQuote({
      wilaya_code: 16,
      delivery_mode: "home",
    });
    const deskQuote = await service.resolveDeliveryQuote({
      wilaya_code: 16,
      delivery_mode: "desk",
    });

    expect(homeQuote).toEqual({
      wilaya_code: 16,
      carrier_wilaya_code: 16,
      delivery_mode: "home",
      amount: 700,
      currency_code: "dzd",
    });
    expect(deskQuote.amount).toBe(400);
  });

  it("returns mother_wilaya_code as carrier_wilaya_code for 2026 wilayas (59-69)", async () => {
    listWilayaRatesMock.mockResolvedValue([
      {
        wilaya_code: 59,
        mother_wilaya_code: 3,
        home_price: 900,
        desk_price: 600,
        is_active: true,
        overrides: [],
      },
    ]);

    const quote = await service.resolveDeliveryQuote({
      wilaya_code: 59,
      delivery_mode: "home",
    });

    expect(quote.wilaya_code).toBe(59);
    expect(quote.carrier_wilaya_code).toBe(3);
    expect(quote.amount).toBe(900);
  });

  it("matches CommuneOverride regardless of diacritics/apostrophes", async () => {
    listWilayaRatesMock.mockResolvedValue([
      {
        wilaya_code: 16,
        mother_wilaya_code: null,
        home_price: 700,
        desk_price: 400,
        is_active: true,
        overrides: [
          {
            commune_name_fr: "Zeralda",
            commune_key: "zeralda",
            home_delivery_price: 950,
            stop_desk_price: 550,
            is_active: true,
          },
        ],
      },
    ]);

    const quote = await service.resolveDeliveryQuote({
      wilaya_code: 16,
      commune_name_fr: "Zéralda",
      delivery_mode: "desk",
    });

    expect(quote.amount).toBe(550);
  });

  it("throws INVALID_DATA when wilaya is missing or disabled", async () => {
    listWilayaRatesMock.mockResolvedValue([
      {
        wilaya_code: 11,
        is_active: false,
        home_price: 1200,
        desk_price: 800,
        overrides: [],
      },
    ]);

    await expect(
      service.resolveDeliveryQuote({ wilaya_code: 11, delivery_mode: "home" })
    ).rejects.toThrow(MedusaError);

    listWilayaRatesMock.mockResolvedValue([]);
    await expect(
      service.resolveDeliveryQuote({ wilaya_code: 99, delivery_mode: "home" })
    ).rejects.toThrow(MedusaError);
  });

  it("throws INVALID_DATA when commune override has is_active: false (no base-price fallback)", async () => {
    listWilayaRatesMock.mockResolvedValue([
      {
        wilaya_code: 16,
        mother_wilaya_code: null,
        home_price: 700,
        desk_price: 400,
        is_active: true,
        overrides: [
          {
            commune_name_fr: "Sidi M'Hamed",
            commune_key: "sidi m hamed",
            home_delivery_price: 700,
            stop_desk_price: 400,
            is_active: false,
          },
        ],
      },
    ]);

    await expect(
      service.resolveDeliveryQuote({
        wilaya_code: 16,
        commune_name_fr: "Sidi M’Hamed",
        delivery_mode: "home",
      })
    ).rejects.toThrow(/disabled/i);
  });
});