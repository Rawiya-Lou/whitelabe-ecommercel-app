import dz from "geoalgeria"

const rawWilayas = dz.wilayas;
const rawCommunes = dz.communes;
export interface RawGeoWilaya {
  code: string | number;
  name_fr: string;
  name_ar: string;
}

export interface RawGeoCommune {
  code: string | number;
  wilaya_code: string | number;
  name_fr: string;
  name_ar: string;
}

function toArray<T>(data: unknown, nestedKey: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj[nestedKey])) return obj[nestedKey] as T[];
    if (Array.isArray(obj.default)) return obj.default as T[];
    return Object.values(obj) as T[];
  }
  return [];
}

export function getGeoWilayas(): RawGeoWilaya[] {
  return toArray<RawGeoWilaya>(rawWilayas, "wilayas");
}

export function getGeoCommunesByWilaya(wilayaCode: number): RawGeoCommune[] {
  const all = toArray<RawGeoCommune>(rawCommunes, "communes");
  return all.filter((c) => Number(c.wilaya_code) === Number(wilayaCode));
}