import { medusaClient } from "./client";

export interface MedusaRegion {
  id: string;
  name: string;
  currency_code: string;
  countries: Array<{ iso_2: string }>;
}

interface CountryCodeType {
  countryCode: string;
}
// server-side utility to map a country code to a Medusa v2 Region
export async function getMedusaRegionByCountry({
  countryCode,
}: CountryCodeType): Promise<MedusaRegion | undefined> {
  try {
    const cleanCountryCode = countryCode.toLowerCase();
    // Fetch available regions from Medusa v2 Store API

    const response = await medusaClient.store.region.list({
      fields: "id,name,currency_code,+countries",
    });

    const regions = response.regions as unknown as MedusaRegion[];
    if (!regions || regions.length === 0) {
      throw new Error("No active regions returned from the medusa v2 backend ");
    }

    const matchedRegion = regions.find((region) => {
      return region.countries?.some(
        (country) => country.iso_2.toLowerCase() === cleanCountryCode,
      );
    });

    if (matchedRegion) {
      return matchedRegion;
    }

    const defaultRegion = regions.find(
      (r) => r.name.toLowerCase().includes("default") || regions[0],
    );

    return defaultRegion;
  } catch (error) {
    console.error("Critical error inside getMedusaRegionByCountry:", error);
    return {
      id: "reg_default_fallback",
      name: "Default Region",
      currency_code: "usd",
      countries: [{ iso_2: "us" }],
    };
  }
}
