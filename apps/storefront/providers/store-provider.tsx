import React from "react";
import { cookies } from "next/headers";
import { getMedusaRegionByCountry, getAllMedusaRegions } from "@/lib/medusa/regions";
import { LOCALS } from "@/i18n/constants";
import { MedusaStoreClient, type StoreContextType } from "./medusa-store-context";

/**
 * Server Component: Fetches regions asynchronously from Medusa v2 backend
 * before rendering the client provider.
 * MedusaStoreProvider.tsx (Async Server Component): Reads cookies/headers and fetches regions/cart data from the Medusa backend.
 */
export async function MedusaStoreProvider({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: `${LOCALS}`;
}) {
  const cookieStore = await cookies();

  // 1. Prioritize user's manual choice or detected cookie from proxy.ts
  const activeCountryCode = (
    cookieStore.get("_medusa_country")?.value || "US"
  ).toLowerCase();

  // 2. Resolve matching Medusa region
  const [activeRegionResult, allRegions] = await Promise.all([
    getMedusaRegionByCountry(activeCountryCode),
    getAllMedusaRegions(),
  ]);

  const activeRegion = activeRegionResult || allRegions[0] || null;

  // 3. Dynamic Algeria check based on Medusa region country codes
  const isAlgeria =
    activeRegion?.countries?.some(
      (c) => c.iso_2?.toLowerCase() === "dz"
    ) ?? false;

  const contextValue: StoreContextType = {
    region: activeRegion,
    regions: allRegions,
    locale,
    currencyCode: activeRegion?.currency_code?.toUpperCase() || "USD",
    isAlgeria,
  };

  return <MedusaStoreClient value={contextValue}>{children}</MedusaStoreClient>;
}