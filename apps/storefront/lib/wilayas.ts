import { LOCALS } from "@/i18n/constants";

// Static imports allow Next.js/Turbopack to trace and inline the data during build

import rawWilayas from "geoalgeria/data/wilayas.json";
import communes1_23 from "geoalgeria/data/communes_w1_w23.json";
import communes24_48 from "geoalgeria/data/communes_w24_w48.json";
import communes49_69 from "geoalgeria/data/communes_w49_w69.json";

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

export interface LocalizedGeographyNode {
  code: number;
  name: string;
}


export function getLocalizedWilayas(locale: `${LOCALS}`): LocalizedGeographyNode[] {
  const wilayas = rawWilayas as unknown as RawGeoAlgeriaWilaya[];

  return wilayas
    .map((w) => ({
      code: Number(w.code),
      name: locale === LOCALS.AR ? w.name_ar : locale === LOCALS.FR ? w.name_fr : w.name,
    }))
    .sort((a, b) => a.code - b.code);
}


const ALL_COMMUNES = [
  ...(communes1_23 as unknown as RawGeoAlgeriaCommune[]),
  ...(communes24_48 as unknown as RawGeoAlgeriaCommune[]),
  ...(communes49_69 as unknown as RawGeoAlgeriaCommune[]),
];

export function getLocalizedCommunes(
  wilayaCode: number,
  locale: `${LOCALS}`
): LocalizedGeographyNode[] {
  const filtered = ALL_COMMUNES.filter(
    (c) => Number(c.wilaya_code) === wilayaCode
  );

  return filtered
    .map((c) => ({
      code: Number(c.code),
      name: locale === LOCALS.AR ? c.name_ar : locale === LOCALS.FR ? c.name_fr : c.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}