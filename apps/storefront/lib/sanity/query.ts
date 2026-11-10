import { sanityClient } from "./client";
import { LOCALS } from "@/i18n/constants";

export interface SanityLocalizedHero {
  _id: string;
  title: string;
  subtitle: string;
  ctaText: string;
  badgeText?: string;
  heroImage?: {
    asset: {
      _ref: string;
      _type: "reference";
    };
  };
}

export interface SanityLocalizedFeatureBlock {
  _id: string;
  heading: string;
  body: string;
  tag: string;
}

export interface SanityUiTranslationDoc {
  namespace: string;
  items: Array<{
    key: string;
    text?: string;
  }>;
}

export interface SanityLocalizedSeo {
  siteName?: string;
  favicon?: {
    asset: {
      _ref: string;
      _type: "reference";
    };
  };
  defaultTitle?: string;
  defaultDescription?: string;
  keywords?: string;
  ogImage?: {
    asset: {
      _ref: string;
      _type: "reference";
    };
  };
}

export const uiTranslationsQuery = `*[_type == "uiTranslation"] {
  namespace,
  "items": coalesce(items[], []) {
    key,
    "text": value[$locale]
  }
}`;

export async function getUiTranslations(
  locale: string,
): Promise<Record<string, Record<string, string>>> {
  try {
    const data = await sanityClient.fetch<SanityUiTranslationDoc[]>(
      uiTranslationsQuery,
      { locale },
      {
        next: {
          revalidate: 3600, // ISR: 1 hour cache
          tags: [`sanity-translations-${locale}`],
        },
      },
    );

    const dictionary: Record<string, Record<string, string>> = {};

    for (const doc of data || []) {
      if (!doc.namespace) continue;
      if (!dictionary[doc.namespace]) {
        dictionary[doc.namespace] = {};
      }
      for (const item of doc.items || []) {
        if (item.key && item.text) {
          dictionary[doc.namespace][item.key] = item.text;
        }
      }
    }

    return dictionary;
  } catch (error) {
    console.error(
      `[Sanity Query Error] Failed to fetch UI translations for "${locale}":`,
      error,
    );
    return {};
  }
}

export async function getLocalizedSiteSeo(
  locale: string,
): Promise<SanityLocalizedSeo | null> {
  const seoQuery = `*[_type == "siteSettings"][0] {
     "siteName": siteName[$locale],
    "defaultTitle": defaultTitle[$locale],
    "defaultDescription": defaultDescription[$locale],
    "keywords": keywords[$locale],
    ogImage {
      asset
    },
    favicon {
      asset
    }
  }`;

  try {
    return await sanityClient.fetch<SanityLocalizedSeo | null>(
      seoQuery,
      { locale },
      {
        next: {
          revalidate: 3600, // ISR: Revalidate hourly
          tags: ["sanity-seo", `sanity-seo-${locale}`],
        },
      },
    );
  } catch (error) {
    console.error(
      `[Sanity Query Error] Failed to resolve site SEO for locale "${locale}":`,
      error,
    );
    return null;
  }
}

export async function getLocalizedHeroSection(
  locale: `${LOCALS}` | string,
): Promise<SanityLocalizedHero | null> {
  const heroQuery = `*[_type == "heroSection"][0] {
    _id,
    "title": title[$locale],
    "subtitle": subtitle[$locale],
    "ctaText": ctaText[$locale],
    "badgeText": badgeText[$locale],
    heroImage {
      asset
    }
  }`;

  try {
    return await sanityClient.fetch<SanityLocalizedHero | null>(
      heroQuery,
      { locale },
      {
        next: {
          revalidate: 3600,
          tags: [`sanity-hero-${locale}`],
        },
      },
    );
  } catch (error) {
    console.error(
      `[Sanity Query Error] Failed to resolve localized hero section for locale "${locale}":`,
      error,
    );
    return null;
  }
}


export interface BrandSettings {
  storeName: string;
  logo?: {
    asset: { _ref: string; _type: "reference" };
    alt?: string;
  };
  logoDark?: {
    asset: { _ref: string; _type: "reference" };
  };
  favicon?: {
    asset: { _ref: string; _type: "reference" };
  };
}

export async function getBrandSettings(): Promise<BrandSettings | null> {
  const query = `*[_type == "siteSettings"][0] {
    storeName,
    logo { asset, alt },
    logoDark { asset },
    favicon { asset }
  }`;

  try {
    return await sanityClient.fetch<BrandSettings | null>(
      query,
      {},
      {
        next: {
          revalidate: 86400, // Cache brand settings for 24 hours
          tags: ["sanity-brand"],
        },
      }
    );
  } catch (error) {
    console.error("[Sanity Query Error] Failed to fetch brand settings:", error);
    return null;
  }
}

export async function getLocalizedFeatures(
  locale: `${LOCALS}` | string,
): Promise<SanityLocalizedFeatureBlock[]> {
  const featuresQuery = `*[_type == "featureBlock" && active == true] | order(_createdAt desc) {
    _id,
    "heading": heading[$locale],
    "body": body[$locale],
    "tag": tag
  }`;

  try {
    return await sanityClient.fetch<SanityLocalizedFeatureBlock[]>(
      featuresQuery,
      { locale },
      {
        next: {
          revalidate: 86400, // 24 hours
          tags: [`sanity-features-${locale}`],
        },
      },
    );
  } catch (error) {
    console.error(
      `[Sanity Query Error] Failed to resolve features stack for locale "${locale}":`,
      error,
    );
    return [];
  }
}
