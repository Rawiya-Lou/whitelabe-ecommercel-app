import { defineRouting } from "next-intl/routing";
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
  locales: ["en", "fr", "ar"],
  defaultLocale: "en",
  // Do not show locale prefix for default language in URLs (/ directly renders english, /ar renders Arabic)
  localePrefix: "as-needed",
});

export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
