'use client';
import React, { createContext, useContext } from "react";

import {
  type MedusaRegion,
} from "@/lib/medusa/regions";
import { LOCALS } from "@/i18n/constants";

export interface StoreContextType {
  region: MedusaRegion;
  locale: `${LOCALS}`;
  currencyCode: string;
}

const StoreContext = createContext<StoreContextType | null>(null);

// Enterprise-grade context layer parsing Edge Geo-IP mappings directly into layouts.

export async function MedusaStoreClient({
  children,
  value,
}: {
  children: React.ReactNode;
 value: StoreContextType
}) {
 
  return (
    <StoreContext.Provider value={value}>
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
