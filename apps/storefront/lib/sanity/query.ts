import { sanityClient } from "./client";
import { LOCALS } from "@/i18n/constants";

export interface SanityLocalizedHero {
  _id: string;
  title: string;
  subtitle: string;
  ctaText: string;
  badgeText?: string;
  heroImage: {
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


export async function getLocalizedHeroSection(locale: `${LOCALS}`): Promise<SanityLocalizedHero | null> {
  // Use GROQ parameters dynamically mapping string attributes -> field[$locale]
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
    const data = await sanityClient.fetch<SanityLocalizedHero | null>(
      heroQuery,
      { locale }, // Encapsulated parameter object safely injected into the GROQ token pipeline
      { 
        // Force server layout performance caches using NextJS 15 fetch properties
        next: { 
          revalidate: 3600, // ISR: Revalidate edge content every hour
          tags: [`sanity-hero-${locale}`] // Targeted cache invalidation tag for Webhook flushing
        } 
      }
    );
    return data;
  } catch (error) {
    console.error(`[Sanity Query Error] Failed to resolve localized hero section for locale "${locale}":`, error);
    return null;
  }
}

/**
 * Fetches collections of localized promotional feature blocks.
 */
export async function getLocalizedFeatures(locale: `${LOCALS}`): Promise<SanityLocalizedFeatureBlock[]> {
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
          revalidate: 86400, // Cache structural blocks for 24 hours
          tags: [`sanity-features-${locale}`]
        }
      }
    );
  } catch (error) {
    console.error(`[Sanity Query Error] Failed to resolve features stack for locale "${locale}":`, error);
    return [];
  }
}
