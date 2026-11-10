"use client";

import React, { createContext, useContext } from "react";
import { type MedusaRegion } from "@/lib/medusa/regions";
import { LOCALS } from "@/i18n/constants";

export interface StoreContextType {
  region: MedusaRegion;
  regions: MedusaRegion[];
  locale: `${LOCALS}`;
  currencyCode: string;
  isAlgeria: boolean;
}

const MedusaStoreContext = createContext<StoreContextType | null>(null);

/**
 * Client context wrapper. 
 * MUST BE SYNCHRONOUS (No 'async' keyword).
 * (Synchronous Client Component): Consumes that initial data as standard React props to supply the context
 */
export function MedusaStoreClient({
  children,
  value,
}: {
  children: React.ReactNode;
  value: StoreContextType;
}) {
  return (
    <MedusaStoreContext.Provider value={value}>
      {children}
    </MedusaStoreContext.Provider>
  );
}

/**
 * Consumer Hook for Storefront UI (Cart drawer, currency switchers, checkout)
 */
export function useMedusaStoreContext(): StoreContextType {
  const context = useContext(MedusaStoreContext);
  if (!context) {
    throw new Error(
      "useMedusaStoreContext must be used within a MedusaStoreProvider"
    );
  }
  return context;
}