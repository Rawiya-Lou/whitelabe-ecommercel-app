// apps/storefront/src/lib/medusa/regions.unit.spec.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMedusaRegionByCountry } from "../medusa/regions";
import { medusaClient } from "../medusa/client";

type MedusaListRegionsResponse = Awaited<ReturnType<typeof medusaClient.store.region.list>>;

type StoreRegionType = MedusaListRegionsResponse["regions"][number];

const { mockRegionList } = vi.hoisted(() => {
  return {
    mockRegionList: vi.fn(),
  };
});

vi.mock("../medusa/client", () => {
  return {
    medusaClient: {
      store: {
        region: {
          list: mockRegionList,
        },
      },
    },
  };
});

describe("Medusa v2 Core Region Sync Matrix (regions.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse available store regions and match the user country code dynamically", async () => {
  
    const mockRegions: StoreRegionType[] = [
      {
        id: "reg_algeria",
        name: "Algeria Region",
        currency_code: "dzd",
        countries: [{ id: "c_dz", iso_2: "dz", iso_3: "dzd", name: "Algeria", display_name: "Algeria" }],
        created_at: "2026",
        updated_at: "2026",
        automatic_taxes: true,
        payment_providers: [],
      
      },
      {
        id: "reg_europe",
        name: "Europe Region",
        currency_code: "eur",
        countries: [
          { id: "c_fr", iso_2: "fr", iso_3: "fra", name: "France", display_name: "France" },
          { id: "c_es", iso_2: "es", iso_3: "esp", name: "Spain", display_name: "Spain" }
        ],
        created_at: "2026",
        updated_at: "2026",
        payment_providers: [],
       
      },
    ];

    const mockResponse: MedusaListRegionsResponse = {
      regions: mockRegions,
      count: mockRegions.length,
      limit: 10,
      offset: 0,
    };

    vi.mocked(medusaClient.store.region.list).mockResolvedValueOnce(mockResponse);

    const result = await getMedusaRegionByCountry("DZ");

    expect(result?.id).toBe("reg_algeria");
    expect(result?.currency_code).toBe("dzd");
    expect(medusaClient.store.region.list).toHaveBeenCalledWith({
      fields: "id,name,currency_code,+countries",
    });
  });

  it("should gracefully resolve to a default global matrix if the provided country token has no region mapping", async () => {
    const mockRegions: StoreRegionType[] = [
     
      {
        id: "reg_global",
        name: "default",
        currency_code: "usd",
        countries: [{ id: "c_us", iso_2: "us", iso_3: "usa", name: "United States", display_name: "United States" }],
        created_at: "2026",
        updated_at: "2026",
        automatic_taxes: true,
        payment_providers: [],
        
      },
       {
        id: "reg_europe",
        name: "default-europe",
        currency_code: "eur",
        countries: [{ id: "c_fr", iso_2: "fr", iso_3: "fra", name: "France", display_name: "France" }],
        created_at: "2026",
        updated_at: "2026",
        automatic_taxes: true,
        payment_providers: [],
      },
    ];

    const mockResponse: MedusaListRegionsResponse = {
      regions: mockRegions,
      count: mockRegions.length,
      limit: 10,
      offset: 0,
    };

    vi.mocked(medusaClient.store.region.list).mockResolvedValueOnce(mockResponse);

    const result = await getMedusaRegionByCountry("JP");

    expect(result?.id).toBe("reg_global");
    expect(result?.currency_code).toBe("usd");
  });

  it("should prevent layout crashes and output a static fallback profile if the backend API goes down", async () => {
    vi.mocked(medusaClient.store.region.list).mockRejectedValueOnce(
      new Error("ECONNREFUSED: Database connection dropped.")
    );

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await getMedusaRegionByCountry("DZ");

    expect(result?.id).toBe("reg_default_fallback");
    expect(result?.currency_code).toBe("usd");
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
