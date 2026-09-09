import { routing } from "./routing";
import { env } from "../app/env.mjs";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { LOCALS } from "./constants";

export type Messages = Record<string, unknown>;

interface SanityCodeField {
  code?: string;
  language?: string;
}

interface SanityQueryResult {
  result?: SanityCodeField;
}

const SANITY_PROJECT_ID = env.NEXT_PUBLIC_SANITY_PROJECT_ID || "4vzx52ot";
const SANITY_DATASET = env.NEXT_PUBLIC_SANITY_DATASET || "production";
const SANITY_API_VERSION = "2026-09-06";

// Server-side fetcher with Next.js tags for revalidation
async function fetchSanityTranslations(locale: string): Promise<Messages> {
  const query = encodeURIComponent(
    `*[_type == "uiTranslation" && locale == "${locale}"][0].messages`,
  );
  const url = `https://${SANITY_PROJECT_ID}.apicdn.sanity.io/v${SANITY_API_VERSION}/data/query/${SANITY_DATASET}?query=${query}`;

  try {
    const res = await fetch(url, {
      next: { tags: [`translations_${locale}`], revalidate: 3600 }, // Cache 1 hour, purgeable via webhook
    });

    if (!res.ok) return {};
    const data: SanityQueryResult = await res.json();
    const rawJsonString = data.result?.code;
    if (!rawJsonString) {
      console.warn(
        `[Sanity] No translation payload string found for locale: ${locale}`,
      );
      return {};
    }
    return JSON.parse(rawJsonString) as Messages;
  } catch (error) {
    console.error(`Failed to fetch Sanity translations for ${locale}:`, error);
    return {};
  }
}

async function getMergedMessages(rawLocale: string | undefined) {
  let locale = rawLocale;

  if (!locale || !routing.locales.includes(locale as LOCALS)) {
    locale = routing.defaultLocale;
  }

  let localMessages: Messages = {};

  try {
    localMessages = (await import(`../messages/${locale}.json`)).default;
  } catch (error) {
    console.error(`Could not load local messages for locale: ${locale}`, error);
  }

  //  Load dynamic translations from Sanity CMS
  const cmsMessages = await fetchSanityTranslations(locale);

  // Deep-merge Sanity strings over local defaults
  return {
    locale,
    messages: {
      ...localMessages,
      ...cmsMessages,
    },
  };
}

export default getRequestConfig(async ({ locale }) => {
  if (!locale || !hasLocale(routing.locales, locale)) {
    locale = routing.defaultLocale;
  }
  return await getMergedMessages(locale);
});
