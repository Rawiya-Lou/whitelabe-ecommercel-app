import { routing } from './routing';
import { env } from '../app/env.mjs';
import { getRequestConfig } from 'next-intl/server'; 




export enum LOCALS {
  EN = "en",
  FR = "fr",
  AR = "ar",
}
const SANITY_PROJECT_ID = env.NEXT_PUBLIC_SANITY_PROJECT_ID || '4vzx52ot';
const SANITY_DATASET = env.NEXT_PUBLIC_SANITY_DATASET || 'production';
const SANITY_API_VERSION = '2026-09-06';


// Server-side fetcher with Next.js tags for revalidation
async function fetchSanityTranslations(locale: string) {
  const query = encodeURIComponent(`*[_type == "uiTranslation" && locale == "${locale}"][0].messages`);
  const url = `https://${SANITY_PROJECT_ID}.apicdn.sanity.io/v${SANITY_API_VERSION}/data/query/${SANITY_DATASET}?query=${query}`;

  try {
    const res = await fetch(url, {
      next: { tags: [`translations_${locale}`], revalidate: 3600 }, // Cache 1 hour, purgeable via webhook
    });

    if (!res.ok) return {};
    const data = await res.json();
    return data.result || {};
  } catch (error) {
    console.error(`Failed to fetch Sanity translations for ${locale}:`, error);
    return {};
  }
}

async function getMergedMessages(requestLocale: string | undefined) {
  let locale = requestLocale;

  if (!locale || !routing.locales.includes(locale as LOCALS)) {
    locale = routing.defaultLocale;
  }

  // 1. Load local fallback messages
  const localMessages = (await import(`../messages/${locale}.json`)).default;

  // 2. Load dynamic translations from Sanity CMS
  const cmsMessages = await fetchSanityTranslations(locale);

  // 3. Deep-merge Sanity strings over local defaults
  return {
    locale,
    messages: {
      ...localMessages,
      ...cmsMessages,
    },
  };
}

export default getRequestConfig(async ({ locale }) => {
  
  const targetLocale = locale ?? routing.defaultLocale;

  return await getMergedMessages(targetLocale);
});