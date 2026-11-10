import { cache } from "react";
import { medusaClient } from "./client";

export interface MedusaCountry {
  id?: string;
  iso_2: string;
  iso_3?: string;
  name?: string;
  display_name?: string;
}

export interface MedusaPaymentProvider {
  id: string;
  is_enabled?: boolean;
}

export interface MedusaRegion {
  id: string;
  name: string;
  currency_code: string;
  countries: MedusaCountry[];
  payment_providers?: MedusaPaymentProvider[];
}

/**
 * 1. Fetches all active Medusa v2 regions (Cached per request)
 */
export const getAllMedusaRegions = cache(async (): Promise<MedusaRegion[]> => {
  try {
    const response = await medusaClient.store.region.list(
      {
        fields: "id,name,currency_code,+countries,+payment_providers",
      },
      {
        next: {
         
          tags: ["medusa-regions"],
        },
      }
    );

    const regions = (response.regions as unknown as MedusaRegion[]) || [];

    if (regions.length === 0) {
      console.warn("[Medusa Regions] No active regions found in Medusa store.");
    }

    return regions;
  } catch (error) {
    console.error("[Medusa Regions] Failed to fetch regions from backend:", error);
    return [];
  }
});

/**
 * 2. Maps a 2-letter Country Code (e.g. 'DZ', 'FR', 'US') to its Medusa Region
 */
export const getMedusaRegionByCountry = cache(
  async (countryCode: string): Promise<MedusaRegion> => {
    const cleanCountryCode = countryCode.trim().toLowerCase();
    const regions = await getAllMedusaRegions();

    // Safe fallback if Medusa is temporarily unreachable
    const fallbackRegion: MedusaRegion = {
      id: "reg_default_fallback",
      name: "Default Region",
      currency_code: "usd",
      countries: [{ iso_2: "us", display_name: "United States" }],
    };

    if (!regions || regions.length === 0) {
      return fallbackRegion;
    }

    // 1. Exact Country Match inside region.countries array
    const matchedRegion = regions.find((region) =>
      region.countries?.some(
        (country) => country.iso_2?.toLowerCase() === cleanCountryCode
      )
    );

    if (matchedRegion) {
      return matchedRegion;
    }

    // 2. Fallback: Look for a region explicitly named "default"
    const defaultNamedRegion = regions.find((r) =>
      r.name?.toLowerCase().includes("default")
    );

    if (defaultNamedRegion) {
      return defaultNamedRegion;
    }

    // 3. Last Fallback: First active region from backend
    return regions[0] || fallbackRegion;
  }
);