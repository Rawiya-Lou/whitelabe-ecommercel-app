import { describe, it, expect, vi, beforeEach } from "vitest";
import { MedusaStoreProvider } from "../store-provider";
import { StoreContextType } from "../medusa-store-context";
import { MedusaRegion } from "@/lib/medusa/regions";
import { LOCALS } from "@/i18n/constants";

// 1. Declare clean type-safe return contracts for hoisted tracking functions
const { mockGetMedusaRegionByCountry, mockHeaders } = vi.hoisted(() => {
  return {
    mockGetMedusaRegionByCountry: vi.fn<() => Promise<MedusaRegion>>(),
    mockHeaders: vi.fn<() => Map<string, string>>(),
  };
});

vi.mock("next/headers", () => {
  return {
    headers: () => {
      const computedHeaders = mockHeaders();
      return {
        get: (key: string) => computedHeaders.get(key) ?? null,
      };
    },
  };
});

vi.mock("@/lib/medusa/regions", () => {
  return {
    getMedusaRegionByCountry: mockGetMedusaRegionByCountry,
  };
});

// Explicit type contract to cast the evaluated Server Component tree node elements safely
interface ReactJSXDescriptorNode {
  props: {
    value: StoreContextType;
    children: unknown;
  };
}

describe("Medusa Server Store Context Provider (Architecture Suite)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should extract edge headers, query medusa regions, and yield correct prop configurations", async () => {
    const headersMap = new Map<string, string>([["x-user-country", "DZ"]]);
    mockHeaders.mockReturnValueOnce(headersMap);

    const mockRegionPayload: MedusaRegion = {
      id: "reg_dz_algeria",
      name: "Algeria Store Region",
      currency_code: "dzd",
      countries: [{ iso_2: "dz" }],
    };
    mockGetMedusaRegionByCountry.mockResolvedValueOnce(mockRegionPayload);

    // Invoke the Server Component to parse out raw object elements
    const resultElement = (await MedusaStoreProvider({
      locale: LOCALS.AR,
      children: "test-child",
    })) as unknown as ReactJSXDescriptorNode;

    // Direct Node Traversal: Assert against the type-safe props value tree object natively
    expect(resultElement.props.value).toEqual({
      region: mockRegionPayload,
      locale: LOCALS.AR,
      currencyCode: "DZD",
    });

    expect(mockGetMedusaRegionByCountry).toHaveBeenCalledWith("DZ");
  });


  it("should fallback gracefully to Algeria country constraints if the header token is missing", async () => {
    const emptyHeadersMap = new Map<string, string>();
    mockHeaders.mockReturnValueOnce(emptyHeadersMap);

    const mockRegionPayload: MedusaRegion = {
      id: "reg_fallback_dz",
      name: "Default Algeria Zone",
      currency_code: "dzd",
      countries: [{ iso_2: "dz" }],
    };
    mockGetMedusaRegionByCountry.mockResolvedValueOnce(mockRegionPayload);

    const resultElement = (await MedusaStoreProvider({
      locale: LOCALS.EN,
      children: "test-child",
    })) as unknown as ReactJSXDescriptorNode;

    expect(resultElement.props.value).toEqual({
      region: mockRegionPayload,
      locale: LOCALS.EN,
      currencyCode: "DZD",
    });

    expect(mockGetMedusaRegionByCountry).toHaveBeenCalledWith("DZ");
  });
});
