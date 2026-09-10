import { defineRouting } from "next-intl/routing";
import { LOCALS } from "./constants";

export const routing = defineRouting({
  locales: Object.values(LOCALS),
  defaultLocale: LOCALS.EN,
  localePrefix: "always",
  localeDetection: false // Handled manually inside proxy.ts via Geo-IP
});

export type Locale = `${LOCALS}`;