import { getSanityImageFallbackUrl} from "../../../../utils/backend-url";

const DEFAULT_FALLBACK = getSanityImageFallbackUrl();

export const isAllowedCdnUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "cdn.sanity.io" ||
      parsed.hostname.endsWith(".sanity.io")
    );
  } catch {
    return false;
  }
};

export function extractImageToken(image: any): string | undefined {
  if (!image) return undefined;
  if (typeof image === "string") return image.trim();

  const token =
    image.url ||
    image.asset?._ref ||
    image.asset?._id ||
    image._ref ||
    image._id;

  return typeof token === "string" ? token.trim() : undefined;
}

export const getSanityCdnUrl = (
  refId: string,
  projectId: string,
  dataset: string,
  fallbackUrl: string = DEFAULT_FALLBACK,
): string => {
  if (!refId) return fallbackUrl;
  try {
    const cleanRef = refId.replace(/^image-/, "");
    const parts = cleanRef.split("-");

    if (parts.length < 3) return fallbackUrl;
    const dimensions = parts.pop();
    const extension = parts.pop();
    const id = parts.join("-");

    return `https://cdn.sanity.io/images/${projectId}/${dataset}/${id}-${dimensions}.${extension}`;
  } catch {
    return fallbackUrl;
  }
};

export const getSafeImageUrl = (
  token: string | undefined,
  projectId: string,
  dataset: string,
  fallbackUrl: string = DEFAULT_FALLBACK,
): string => {
  if (!token) return fallbackUrl;

  if (/^https?:\/\//i.test(token)) {
    return isAllowedCdnUrl(token) ? token : fallbackUrl;
  }
  return getSanityCdnUrl(token, projectId, dataset, fallbackUrl);
};