import { env } from "../../app/env.mjs";
export interface WilayaShippingRate {
  wilayaCode: number;
  homePrice: number;
  deskPrice: number;
  isAvailable: boolean;
}

export async function fetchWilayaRate(wilayaCode: number): Promise<WilayaShippingRate | null> {
  try {
    const res = await fetch(
      `${env.NEXT_PUBLIC_MEDUSA_BACKEND_URL}/store/algerian-logistics/rates/${wilayaCode}`,
      {
        headers: {
          "x-publishable-api-key": env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || "",
        },
        next: { revalidate: 3600 }, // Cache rate per wilaya for 1 hour
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    return data.rate;
  } catch (error) {
    console.error(`Failed to fetch shipping rate for Wilaya ${wilayaCode}:`, error);
    return null;
  }
}