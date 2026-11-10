"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
} from "react";
import { LOCALS } from "@/i18n/constants";
import {
  getLocalizedWilayas,
  getLocalizedCommunes,
  LocalizedGeographyNode,
} from "../lib/wilayas";
import {
  fetchWilayaRate,
  WilayaShippingRate,
} from "@/lib/medusa/algerian-shipping";

interface AlgerianDeliveryContextType {
  isAlgeria: boolean;
  wilayas: LocalizedGeographyNode[];
  communes: LocalizedGeographyNode[];
  selectedWilaya: number | null;
  setSelectedWilaya: (code: number | null) => void;
  selectedCommune: number | null;
  setSelectedCommune: (code: number | null) => void;
  isStopDesk: boolean;
  setIsStopDesk: (stopDesk: boolean) => void;
  activeRate: WilayaShippingRate | null;
  shippingPrice: number;
  isLoadingRate: boolean;
}

const AlgerianDeliveryContext =
  createContext<AlgerianDeliveryContextType | null>(null);

export function AlgerianDeliveryProvider({
  children,
  locale,
  isAlgeriaRegion,
}: {
  children: React.ReactNode;
  locale: `${LOCALS}`;
  isAlgeriaRegion: boolean;
}) {
  const [selectedWilaya, setSelectedWilaya] = useState<number | null>(16); // Default: 16 (Alger)
  const [selectedCommune, setSelectedCommune] = useState<number | null>(null);
  const [isStopDesk, setIsStopDesk] = useState<boolean>(false);
  const [activeRate, setActiveRate] = useState<WilayaShippingRate | null>(null);

  // Instant localized dropdown data (In-memory)
  const wilayas = useMemo(() => {
    return isAlgeriaRegion ? getLocalizedWilayas(locale) : [];
  }, [isAlgeriaRegion, locale]);

  const communes = useMemo(() => {
    if (!isAlgeriaRegion || !selectedWilaya) return [];
    return getLocalizedCommunes(selectedWilaya, locale);
  }, [isAlgeriaRegion, selectedWilaya, locale]);

  // Fetch rate from Medusa backend without synchronous setState in effect body
  useEffect(() => {
    if (!isAlgeriaRegion || !selectedWilaya) return;

    let isMounted = true;

    fetchWilayaRate(selectedWilaya).then((rate) => {
      if (isMounted) {
        setActiveRate(rate);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedWilaya, isAlgeriaRegion]);

  // Derived loading state (No setState needed!)
  const isLoadingRate =
    isAlgeriaRegion &&
    selectedWilaya !== null &&
    activeRate?.wilayaCode !== selectedWilaya;

  // Current price based on Stop-Desk vs Home Delivery
  const shippingPrice = useMemo(() => {
    if (!activeRate) return 0;
    return isStopDesk ? activeRate.deskPrice : activeRate.homePrice;
  }, [activeRate, isStopDesk]);

  return (
    <AlgerianDeliveryContext.Provider
      value={{
        isAlgeria: isAlgeriaRegion,
        wilayas,
        communes,
        selectedWilaya,
        setSelectedWilaya: (code) => {
          setSelectedWilaya(code);
          setSelectedCommune(null);
        },
        selectedCommune,
        setSelectedCommune,
        isStopDesk,
        setIsStopDesk,
        activeRate,
        shippingPrice,
        isLoadingRate,
      }}
    >
      {children}
    </AlgerianDeliveryContext.Provider>
  );
}

export function useAlgerianDelivery() {
  const context = useContext(AlgerianDeliveryContext);
  if (!context) {
    throw new Error(
      "useAlgerianDelivery must be used within an AlgerianDeliveryProvider",
    );
  }
  return context;
}
