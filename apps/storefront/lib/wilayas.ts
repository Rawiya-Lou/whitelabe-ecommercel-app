import dz from "geoalgeria";
import { env } from "@/app/env.mjs";
import { LOCALS } from "@/i18n/constants";

export interface CommuneOverrideDTO {
  commune_name_fr: string;
  commune_name_ar: string;
  commune_name_en: string;
  home_delivery_price: number;
  stop_desk_price: number;
  is_active: boolean;
}

export interface StoreWilayaRate {
  wilaya_code: number;
  wilaya_name_en: string;
  wilaya_name_fr: string;
  wilaya_name_ar: string;
  home_price: number;
  desk_price: number;
  overrides: CommuneOverrideDTO[];
}

export interface LocalizedWilaya {
  code: number;
  name: string;
  name_en: string;
  name_fr: string;
  name_ar: string;
  home_price: number;
  desk_price: number;
  overrides: CommuneOverrideDTO[];
}

export interface LocalizedCommune {
  code: string;
  name: string;
  name_fr: string;
  name_ar: string;
  name_en: string;
  home_price: number;
  desk_price: number;
  is_active: boolean;
}

export function normalizeCommuneKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function pickLocalizedName(
  item: { name_ar: string; name_fr: string; name_en?: string },
  locale: string
): string {
  if (locale === LOCALS.AR) return item.name_ar || item.name_fr;
  if (locale === LOCALS.FR) return item.name_fr;
  return item.name_en || item.name_fr;
}

/**
 * Fetches merchant-configured active Wilayas, base prices, and commune overrides
 * from Medusa Store API (server-side cached with Next.js tag "wilaya-rates").
 */
export async function fetchStoreWilayaRates(): Promise<StoreWilayaRate[]> {
  try {
    const baseUrl = env.NEXT_PUBLIC_MEDUSA_BACKEND_URL.replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/store/wilaya-rates`, {
      headers: {
        "x-publishable-api-key": env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
      },
      next: { tags: ["wilaya-rates"], revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];
    const data = (await res.json()) as { wilaya_rates?: StoreWilayaRate[] };
    return Array.isArray(data.wilaya_rates) ? data.wilaya_rates : [];
  } catch {
    return [];
  }
}

/**
 * Formats backend WilayaRates for the UI in the active locale (EN / FR / AR).
 * Falls back gracefully to static geoalgeria names ONLY if rates array is omitted.
 */
export function getLocalizedWilayas(
  locale: string,
  backendRates?: StoreWilayaRate[]
): LocalizedWilaya[] {
  if (Array.isArray(backendRates) && backendRates.length > 0) {
    return backendRates
      .map((w) => ({
        code: Number(w.wilaya_code),
        name: pickLocalizedName(
          {
            name_en: w.wilaya_name_en,
            name_fr: w.wilaya_name_fr,
            name_ar: w.wilaya_name_ar,
          },
          locale
        ),
        name_en: w.wilaya_name_en,
        name_fr: w.wilaya_name_fr,
        name_ar: w.wilaya_name_ar,
        home_price: Number(w.home_price),
        desk_price: Number(w.desk_price),
        overrides: w.overrides ?? [],
      }))
      .sort((a, b) => a.code - b.code);
  }

  // Static fallback (e.g., if backend rates haven't loaded yet)
  const rawWilayas = Array.isArray(dz?.wilayas) ? dz.wilayas : [];
  return rawWilayas
    .map((w) => ({
      code: Number(w.code),
      name: pickLocalizedName({ name_fr: w.name_fr, name_ar: w.name_ar }, locale),
      name_en: w.name_fr,
      name_fr: w.name_fr,
      name_ar: w.name_ar,
      home_price: 700,
      desk_price: 400,
      overrides: [],
    }))
    .sort((a, b) => a.code - b.code);
}

/**
 * Reads static communes from geoalgeria and overlays merchant CommuneOverrides
 * (disabled communes are filtered out; overridden prices replace base prices).
 */
export function getLocalizedCommunes(
  wilayaCode: number,
  locale: string,
  wilayaRate?: Pick<LocalizedWilaya, "home_price" | "desk_price" | "overrides">
): LocalizedCommune[] {
  const rawCommunes = dz?.getCommunesByWilaya
    ? dz.getCommunesByWilaya(Number(wilayaCode))
    : [];

  if (!Array.isArray(rawCommunes)) return [];

  const baseHome = wilayaRate?.home_price ?? 700;
  const baseDesk = wilayaRate?.desk_price ?? 400;
  const overridesMap = new Map<string, CommuneOverrideDTO>();

  for (const ov of wilayaRate?.overrides ?? []) {
    overridesMap.set(normalizeCommuneKey(ov.commune_name_fr), ov);
  }

  return rawCommunes
    .map((c) => {
      const override = overridesMap.get(normalizeCommuneKey(c.name_fr));
      const isActive = override ? override.is_active : true;
      const name_ar = override?.commune_name_ar || c.name_ar;

      return {
        code: String(c.code_commune),
        name: pickLocalizedName({ name_fr: c.name_fr, name_ar }, locale),
        name_fr: c.name_fr,
        name_ar,
        name_en: c.name_fr,
        home_price: override ? Number(override.home_delivery_price) : baseHome,
        desk_price: override ? Number(override.stop_desk_price) : baseDesk,
        is_active: isActive,
      };
    })
    .filter((c) => c.is_active)
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

/**
 * Pure UI helper to compute the shipping fee for the selected Wilaya, Commune, and mode.
 * (Authoritative price is still recomputed on apps/backend at checkout.)
 */
export function resolveUiDeliveryPrice(params: {
  wilayaRate?: LocalizedWilaya;
  commune?: LocalizedCommune | null;
  isStopDesk: boolean;
}): number {
  const { wilayaRate, commune, isStopDesk } = params;
  if (commune) {
    return isStopDesk ? commune.desk_price : commune.home_price;
  }
  if (wilayaRate) {
    return isStopDesk ? wilayaRate.desk_price : wilayaRate.home_price;
  }
  return 0;
}