"use client";
import React, { createContext, useContext, useMemo, useEffect, useState } from "react";
import { LOCALS } from "@/i18n/constants";

import { getLocalizedWilayas, LocalizedGeographyNode } from "../lib/wilayas";

interface AlgerianDeliveryContextType {
  isAlgerianContext: boolean;
  localizedWilayas: LocalizedGeographyNode[];
  isLoading: boolean;
}

const AlgerianDeliveryContext = createContext<AlgerianDeliveryContextType | null>(null);

export function AlgerianDeliveryProvider({
  children,
  locale,
  isAlgeriaRegion,
}: {
  children: React.ReactNode;
  locale: `${LOCALS}`;
  isAlgeriaRegion: boolean;
}) {
  const [localizedWilayas, setLocalizedWilayas] = useState<LocalizedGeographyNode[]>([]);
  const [isLoading, setIsLoading] = useState(isAlgeriaRegion);

  useEffect(() => {
    if (!isAlgeriaRegion) return;

    let isMounted = true;
    
    async function fetchGeoData() {
      try {
        setIsLoading(true);
        // Safely invoke our server-isolated geoalgeria payload call wrapper
        const data = await getLocalizedWilayas(locale);
        
        if (isMounted) {
          setLocalizedWilayas(data);
        }
      } catch (err) {
        console.error("Failed compiling geoalgeria package metrics:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchGeoData();

    return () => {
      isMounted = false;
    };
  }, [locale, isAlgeriaRegion]);

  const contextValue = useMemo(() => ({
    isAlgerianContext: isAlgeriaRegion,
    localizedWilayas,
    isLoading
  }), [isAlgeriaRegion, localizedWilayas, isLoading]);

  return (
    <AlgerianDeliveryContext.Provider value={contextValue}>
      {children}
    </AlgerianDeliveryContext.Provider>
  );
}

export function useAlgerianDelivery() {
  const context = useContext(AlgerianDeliveryContext);
  if (!context) {
    throw new Error("useAlgerianDelivery must be instantiated under a valid AlgerianDeliveryProvider context node.");
  }
  return context;
}
