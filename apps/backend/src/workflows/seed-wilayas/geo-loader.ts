export interface RawGeoWilaya {
  code: string | number;
  name?: string;
  name_fr: string;
  name_ar: string;
}

export function loadGeoWilayas(): RawGeoWilaya[] {
  const dz = require("geoalgeria") as { wilayas?: RawGeoWilaya[] };
  return Array.isArray(dz?.wilayas) ? dz.wilayas : [];
}