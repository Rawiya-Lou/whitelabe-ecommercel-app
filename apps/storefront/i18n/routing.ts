import { defineRouting } from "next-intl/routing";
import { LOCALS } from "./constants";
export const routing = defineRouting({
  locales: [LOCALS.EN, LOCALS.AR, LOCALS.FR],
  defaultLocale: LOCALS.EN,
  localePrefix: "always",
});
