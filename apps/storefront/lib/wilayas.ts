// apps/storefront/lib/wilayas.ts
"use server";

import { LOCALS } from "@/i18n/constants";
import fs from "fs";
import path from "path";

// 1. Define strict type schemas matching the exact geoalgeria payload shapes
export interface RawGeoAlgeriaWilaya {
  code: string;
  name: string;
  name_ar: string;
  name_fr: string;
}

export interface RawGeoAlgeriaCommune {
  code: string;
  wilaya_code: string;
  name: string;
  name_ar: string;
  name_fr: string;
}

// The normalized data structure exported down to your frontend components
export interface LocalizedGeographyNode {
  code: number;
  name: string;
}

const NODE_MODULES_GEO_PATH = path.join(process.cwd(), "node_modules/geoalgeria/data");

/**
 * Safely extracts and types all 69 modern Wilayas from storage without compilation issues.
 */
export async function getLocalizedWilayas(locale: `${LOCALS}`): Promise<LocalizedGeographyNode[]> {
  try {
    const rawDataPath = path.join(NODE_MODULES_GEO_PATH, "wilayas.json");
    const rawData = fs.readFileSync(rawDataPath, "utf-8");
    
    // Explicitly cast the JSON parser string into our structural interface array
    const wilayas = JSON.parse(rawData) as RawGeoAlgeriaWilaya[];

    return wilayas.map((w: RawGeoAlgeriaWilaya): LocalizedGeographyNode => ({
      code: Number(w.code),
      name: locale === LOCALS.AR ? w.name_ar : locale === LOCALS.FR ? w.name_fr : w.name_fr,
    })).sort((a, b) => a.code - b.code);

  } catch (error) {
    console.error("Critical: Failed to read local geoalgeria data streams:", error);
    return [];
  }
}

/**
 * Extracts and maps all communes securely using structural type-safe filters.
 */
export async function getLocalizedCommunes(wilayaCode: number, locale: `${LOCALS}`): Promise<LocalizedGeographyNode[]> {
  try {
    let targetedFile = "communes_w1_w23.json";
    if (wilayaCode >= 24 && wilayaCode <= 48) targetedFile = "communes_w24_w48.json";
    if (wilayaCode >= 49) targetedFile = "communes_w49_w69.json";

    const rawDataPath = path.join(NODE_MODULES_GEO_PATH, targetedFile);
    const rawData = fs.readFileSync(rawDataPath, "utf-8");
    
    // Explicitly cast parsed buffer directly into the strict structural Commune contract
    const communes = JSON.parse(rawData) as RawGeoAlgeriaCommune[];

    const filtered = communes.filter((c: RawGeoAlgeriaCommune) => Number(c.wilaya_code) === wilayaCode);

    return filtered.map((c: RawGeoAlgeriaCommune): LocalizedGeographyNode => ({
      code: Number(c.code),
      name: locale === LOCALS.AR ? c.name_ar : locale === LOCALS.FR ? c.name_fr : c.name_fr,
    })).sort((a, b) => a.name.localeCompare(b.name, locale));

  } catch (error) {
    console.error("Critical: Failed to locate localized communes mapping:", error);
    return [];
  }
}
