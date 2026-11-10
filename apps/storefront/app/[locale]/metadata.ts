import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { LOCALS } from "@/i18n/constants";
import { getLocalizedSiteSeo } from "@/lib/sanity/query";
import { urlFor } from "@/lib/sanity/images";

interface MetadataProps {
  params: Promise<{ locale: string }>;
}

interface FallbackContent {
  siteName: string;
  defaultTitle: string;
  defaultDescription: string;
}

// 1. Strict Offline Fallback Dictionaries (Guarantees zero downtime)
const FALLBACK_STRINGS: Record<LOCALS, FallbackContent> = {
  [LOCALS.EN]: {
    siteName: "Official Store",
    defaultTitle: "Curated Collections & Premium Essentials",
    defaultDescription:
      "Explore our exclusive catalog of authentic products with fast international shipping and secure checkout.",
  },
  [LOCALS.FR]: {
    siteName: "Boutique Officielle",
    defaultTitle: "Collections Exclusives & Shopping International",
    defaultDescription:
      "Découvrez notre sélection exclusive de produits certifiés. Livraison internationale rapide et paiement sécurisé.",
  },
  [LOCALS.AR]: {
    siteName: "المتجر الرسمي",
    defaultTitle: "تشكيلات حصرية واختيارات عصرية راقية",
    defaultDescription:
      "استكشف تشكيلتنا الحصرية من المنتجات الأصلية والمختارة بعناية، مع شحن دولي موثوق ودفع آمن ومحمي.",
  },
};

const OG_LOCALE_MAP: Record<LOCALS, string> = {
  [LOCALS.EN]: "en_US",
  [LOCALS.FR]: "fr_FR",
  [LOCALS.AR]: "ar_DZ", // Primary Algerian market localization
};

export async function generateMetadata({
  params,
}: MetadataProps): Promise<Metadata> {
  const { locale } = await params;

  const activeLocale: LOCALS = routing.locales.includes(locale as LOCALS)
    ? (locale as LOCALS)
    : routing.defaultLocale;

  // 1. Parallel Fetch: Sanity CMS + next-intl translations
  const [cmsSeo, translations] = await Promise.all([
    getLocalizedSiteSeo(activeLocale).catch(() => null),
    getTranslations({ locale: activeLocale, namespace: "metadata" }).catch(() => null),
  ]);

  const fallback =
    FALLBACK_STRINGS[activeLocale] || FALLBACK_STRINGS[routing.defaultLocale];

  // 2. Resolution Cascade: Sanity CMS -> next-intl -> Hardcoded Fallbacks
  const siteName =
    cmsSeo?.siteName || translations?.("siteName") || fallback.siteName;

  const title =
    cmsSeo?.defaultTitle ||
    translations?.("defaultTitle") ||
    fallback.defaultTitle;

  const description =
    cmsSeo?.defaultDescription ||
    translations?.("defaultDescription") ||
    fallback.defaultDescription;

  // 3. Dynamic Base URL (Zero hardcoded domains — adapts to Vercel Previews and Localhost)
  const baseUrl =
    process.env.NEXT_PUBLIC_STOREFRONT_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  // 4. Resolve Dynamic OpenGraph Image & Favicon via Sanity CDN
  const ogImageUrl = cmsSeo?.ogImage?.asset
    ? urlFor(cmsSeo.ogImage).width(1200).height(630).quality(90).url()
    : `${baseUrl}/images/default-og.jpg`;

  const faviconUrl = (cmsSeo)?.favicon?.asset
    ? urlFor((cmsSeo).favicon).width(64).height(64).url()
    : "/favicon.ico";

  const appleTouchIconUrl = (cmsSeo)?.favicon?.asset
    ? urlFor((cmsSeo).favicon).width(180).height(180).url()
    : "/apple-touch-icon.png";

  return {
    metadataBase: new URL(baseUrl),

    title: {
      template: `%s | ${siteName}`,
      default: title,
    },
    description,

    // Relative paths automatically resolve against metadataBase
    alternates: {
      canonical: `/${activeLocale}`,
      languages: routing.locales.reduce<Record<string, string>>((acc, loc) => {
        acc[loc] = `/${loc}`;
        return acc;
      }, {}),
    },

    // ─── DYNAMIC WHITE-LABEL FAVICONS ───
    icons: {
      icon: [{ url: faviconUrl }],
      shortcut: [faviconUrl],
      apple: [{ url: appleTouchIconUrl, sizes: "180x180" }],
    },

    // ─── OPENGRAPH (WhatsApp, Facebook, LinkedIn) ───
    openGraph: {
      title,
      description,
      url: `/${activeLocale}`,
      siteName,
      locale: OG_LOCALE_MAP[activeLocale] || "en_US",
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },

    // ─── TWITTER / X CARDS ───
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },

    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}