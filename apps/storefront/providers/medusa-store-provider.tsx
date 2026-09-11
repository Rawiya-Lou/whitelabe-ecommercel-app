import React, { createContext, useContext } from "react";
import { headers } from "next/headers";
import {
  getMedusaRegionByCountry,
  type MedusaRegion,
} from "@/lib/medusa/regions";
import { LOCALS } from "@/i18n/constants";

interface StoreContextType {
  region: MedusaRegion;
  locale: `${LOCALS}`;
  currencyCode: string;
}

const StoreContext = createContext<StoreContextType | null>(null);

// Enterprise-grade context layer parsing Edge Geo-IP mappings directly into layouts.

export async function MedusaStoreProvider({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: `${LOCALS}`;
}) {
  // 1. Pull the header injected by your proxy.ts middleware pipeline
  const requestHeaders = await headers();
  const countryCode = requestHeaders.get("x-user-country") || "DZ";

  // 2. Resolve matching Medusa region from the API cache
  const activeRegion = (await getMedusaRegionByCountry(
    countryCode,
  )) as MedusaRegion;

  const contextValue: StoreContextType = {
    region: activeRegion,
    locale,
    currencyCode: activeRegion.currency_code.toUpperCase(),
  };

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
}

// Client hook for dynamic UI rendering (e.g., Cart drawer recalculations)
export function useStoreContext() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error(
      "useStoreContext must be executed within a valid MedusaStoreProvider node tree.",
    );
  }
  return context;
}
