// apps/storefront/i18n/request.ts
import { routing } from "./routing";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { LOCALS } from "./constants";
import { getUiTranslations } from "@/lib/sanity/query";

export type MessageValue = string | { [key: string]: MessageValue };
export type Messages = Record<string, MessageValue>;

interface RequestConfigParams {
  requestLocale?: Promise<string | undefined>;
  locale?: string;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepMerge(
  target: Messages = {},
  source: Messages = {}
): Messages {
  const output: Messages = { ...target };

  if (!isRecord(source)) {
    return output;
  }

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = output[key];

    if (isRecord(sourceVal)) {
      output[key] = deepMerge(
        isRecord(targetVal) ? (targetVal as Messages) : {},
        sourceVal as Messages
      );
    } else if (typeof sourceVal === "string" && sourceVal !== "") {
      output[key] = sourceVal;
    }
  }

  return output;
}


export default getRequestConfig(async (context: RequestConfigParams) => {
  const rawLocale = context.requestLocale
    ? await context.requestLocale
    : context.locale;

  const locale: LOCALS =
    rawLocale && hasLocale(routing.locales, rawLocale)
      ? (rawLocale as LOCALS)
      : routing.defaultLocale;

  // Statically load local messages (Offline Fallback)
  let localMessages: Messages = {};
  try {
    const imported = (await import(`../messages/${locale}.json`)) as {
      default: Messages;
    };
    localMessages = imported.default;
  } catch {
    try {
      const fallbackImported = (await import(
        `../messages/${routing.defaultLocale}.json`
      )) as { default: Messages };
      localMessages = fallbackImported.default;
    } catch {
      localMessages = {};
    }
  }

  // Live Sanity CMS translation fetch
  let cmsMessages: Messages = {};
  try {
    const fetched = await getUiTranslations(locale);
    cmsMessages = (fetched as Messages) || {};
  } catch {
    cmsMessages = {};
  }

  return {
    locale,
    messages: deepMerge(localMessages, cmsMessages),
     onError(error) {
      if (error.code !== "MISSING_MESSAGE") {
        console.error(error);
      }
    },
      getMessageFallback({ namespace, key }) {
      return `${namespace ? `${namespace}.` : ""}${key}`;
    },
  };
});