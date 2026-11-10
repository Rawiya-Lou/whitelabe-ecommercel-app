import { LOCALS } from "@/i18n/constants";

export const COUNTRY_TO_LOCALE_MAP: Record<string, LOCALS> = {
  // Arab World (MENA) -> Arabic default
  DZ: LOCALS.AR, // Algeria
  MA: LOCALS.AR, // Morocco
  TN: LOCALS.AR, // Tunisia
  EG: LOCALS.AR, // Egypt
  SA: LOCALS.AR, // Saudi Arabia
  AE: LOCALS.AR, // UAE
  QA: LOCALS.AR, // Qatar
  KW: LOCALS.AR, // Kuwait

  // Francophone -> French default
  FR: LOCALS.FR, // France
  BE: LOCALS.FR, // Belgium
  CH: LOCALS.FR, // Switzerland
  SN: LOCALS.FR, // Senegal
  CI: LOCALS.FR, // Ivory Coast

  // Default everywhere else (US, UK, Germany, etc.) -> English
};

export function getRecommendedLocale(countryCode: string): LOCALS {
  const code = countryCode.toUpperCase();
  return COUNTRY_TO_LOCALE_MAP[code] || LOCALS.EN;
}