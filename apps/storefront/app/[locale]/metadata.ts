import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { routing } from "../../i18n/routing";
import { LOCALS} from '../../i18n/constants';

type MetadataProps = {
  params: Promise<{ locale: string }>;
};

// Centralized Type-Safe Fallbacks Configuration
const FALLBACK_STRINGS: Record<string, Record<string, string>> = {
  en: {
    siteName: "My Storefront",
    defaultTitle: "Welcome to our Store",
    defaultDescription: "Premium whitelabel e-commerce platform storefront.",
  },
  ar: {
    siteName: "متجرنا",
    defaultTitle: "مرحباً بكم في متجرنا",
    defaultDescription: "منصة تجارة إلكترونية متميزة.",
  },
  fr: {
    siteName: "Notre Boutique",
    defaultTitle: "Bienvenue dans notre boutique",
    defaultDescription: "Plateforme e-commerce haut de gamme.",
  },
};

export async function generateMetadata({ params }: MetadataProps): Promise<Metadata> {
  const { locale } = await params;
  
  // Validate locale before fallback execution to prevent runtime crashes
  const activeLocale = routing.locales.includes(locale as LOCALS) ? locale : routing.defaultLocale;

  let t: (key: string) => string;
  
  try {
    const translations = await getTranslations({ locale: activeLocale, namespace: "Metadata" });
    t = (key: string) => translations(key);
  } catch (error) {
    console.error(`[Metadata Error] Namespace missing for locale: ${activeLocale}. Falling back.`, error);
    
    // Resolve localized dictionary fallbacks safely
    const dict = FALLBACK_STRINGS[activeLocale] || FALLBACK_STRINGS[routing.defaultLocale];
    t = (key: string) => dict[key] || "";
  }

  const baseUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL || "http://localhost:3000";

  // Programmatically generate alternate URL objects to support clean scaling
  const languageAlternates = routing.locales.reduce<Record<string, string>>((acc, loc) => {
    acc[loc] = `/${loc}`;
    return acc;
  }, {});

  const siteName = t("siteName");
  const title = t("defaultTitle");
  const description = t("defaultDescription");

  return {
    title: {
      template: `%s | ${siteName}`,
      default: title,
    },
    description,
    metadataBase: new URL(baseUrl),
    alternates: {
      canonical: `/${activeLocale}`,
      languages: languageAlternates,
    },
    openGraph: {
      title,
      description,
      url: `/${activeLocale}`,
      siteName,
      // OpenGraph expects underscore formatting for locales (e.g. ar_DZ, fr_FR)
      locale: activeLocale === "ar" ? "ar_DZ" : activeLocale === "fr" ? "fr_FR" : "en_US",
      type: "website",
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}
