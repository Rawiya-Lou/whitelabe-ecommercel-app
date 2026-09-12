import { LOCALS } from "@/i18n/constants";

export type DirectionType = "rtl" | "ltr";

/**
 * Enterprise-grade utility to safely determine text flow direction based on standard locale enums.
 * @param locale - Active storefront routing locale context
 */
export function getLocaleDirection(locale: string): DirectionType {
  return locale === LOCALS.AR ? "rtl" : "ltr";
}
