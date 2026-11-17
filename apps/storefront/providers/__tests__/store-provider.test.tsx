import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { LOCALS } from "@/i18n/constants";

const mockCookiesGet = vi.hoisted(() => vi.fn());
const mockGetMedusaRegionByCountry = vi.hoisted(() => vi.fn());
const mockGetAllMedusaRegions = vi.hoisted(() => vi.fn());
const mockUseContext = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockCookiesGet,
  })),
}));

vi.mock("@/lib/medusa/regions", () => ({
  getMedusaRegionByCountry: mockGetMedusaRegionByCountry,
  getAllMedusaRegions: mockGetAllMedusaRegions,
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useContext: mockUseContext,
  };
});

import { MedusaStoreProvider } from "../store-provider";
import { useMedusaStoreContext } from "../medusa-store-context";

describe("MedusaStoreProvider & useMedusaStoreContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseContext.mockReturnValue(null);
  });

  it("reads _medusa_country cookie, resolves DZ region, and flags isAlgeria true", async () => {
    mockCookiesGet.mockReturnValue({ value: "DZ" });
    const dzRegion = {
      id: "reg_dz",
      name: "Algeria",
      currency_code: "dzd",
      countries: [{ iso_2: "dz" }],
    };
    const usRegion = {
      id: "reg_us",
      name: "North America",
      currency_code: "usd",
      countries: [{ iso_2: "us" }],
    };

    mockGetMedusaRegionByCountry.mockResolvedValue(dzRegion);
    mockGetAllMedusaRegions.mockResolvedValue([dzRegion, usRegion]);

    const element = (await MedusaStoreProvider({
      children: <div>Store Child</div>,
      locale: LOCALS.AR,
    })) as React.ReactElement<{ value: unknown }>;

    expect(mockCookiesGet).toHaveBeenCalledWith("_medusa_country");
    expect(mockGetMedusaRegionByCountry).toHaveBeenCalledWith("dz");
    expect(element.props.value).toEqual({
      region: dzRegion,
      regions: [dzRegion, usRegion],
      locale: LOCALS.AR,
      currencyCode: "DZD",
      isAlgeria: true,
    });
  });

  it("defaults country to 'us' when _medusa_country cookie is absent", async () => {
    mockCookiesGet.mockReturnValue(undefined);
    const euRegion = {
      id: "reg_eu",
      name: "Europe",
      currency_code: "eur",
      countries: [{ iso_2: "fr" }],
    };

    mockGetMedusaRegionByCountry.mockResolvedValue(null);
    mockGetAllMedusaRegions.mockResolvedValue([euRegion]);

    const element = (await MedusaStoreProvider({
      children: null,
      locale: LOCALS.FR,
    })) as React.ReactElement<{ value: unknown }>;

    expect(mockGetMedusaRegionByCountry).toHaveBeenCalledWith("us");
    expect(element.props.value).toEqual({
      region: euRegion,
      regions: [euRegion],
      locale: LOCALS.FR,
      currencyCode: "EUR",
      isAlgeria: false,
    });
  });

  it("falls back safely to null region and 'USD' when backend returns no regions", async () => {
    mockCookiesGet.mockReturnValue(undefined);
    mockGetMedusaRegionByCountry.mockResolvedValue(null);
    mockGetAllMedusaRegions.mockResolvedValue([]);

    const element = (await MedusaStoreProvider({
      children: null,
      locale: LOCALS.EN,
    })) as React.ReactElement<{ value: unknown }>;

    expect(element.props.value).toEqual({
      region: null,
      regions: [],
      locale: LOCALS.EN,
      currencyCode: "USD",
      isAlgeria: false,
    });
  });

  it("throws when useMedusaStoreContext is called outside MedusaStoreProvider", () => {
    mockUseContext.mockReturnValue(null);
    expect(() => useMedusaStoreContext()).toThrow(
      "useMedusaStoreContext must be used within a MedusaStoreProvider"
    );
  });
});