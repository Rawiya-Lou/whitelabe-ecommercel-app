import React from "react";
import { headers } from "next/headers";
import { getMedusaRegionByCountry, type MedusaRegion } from "@/lib/medusa/regions";
import { LOCALS } from "@/i18n/constants";
import { MedusaStoreClient, type StoreContextType } from "./medusa-store-context";

export async function MedusaStoreProvider({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: `${LOCALS}`;
}) {

  const requestHeaders = await headers();
  const countryCode = requestHeaders.get("x-user-country") || "DZ";


  const activeRegion = (await getMedusaRegionByCountry(
    countryCode,
  )) as MedusaRegion;

  const contextValue: StoreContextType = {
    region: activeRegion,
    locale,
    currencyCode: activeRegion.currency_code.toUpperCase(),
  };

  // 3. Render the client provider, passing the server data down as a prop
  return (
    <MedusaStoreClient value={contextValue}>
      {children}
    </MedusaStoreClient>
  );
}
