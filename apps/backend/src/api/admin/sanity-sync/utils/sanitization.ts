export type OperationTypes = "update" | "create" | "batch" | "delete";
export type DocumentType = "product" | "category";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const getString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export const sanitizeText = (text: unknown, maxLength = 1000): string => {
  if (typeof text !== "string") return "";
  return text
    .replace(/<[^>]*>?/gm, "")
    .trim()
    .slice(0, maxLength);
};

export const sanitizeHex = (hex: unknown): string => {
  if (typeof hex !== "string") return "";
  const match = hex.trim().match(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/);
  return match ? match[0] : "";
};

export const sanitizeHandle = (slug: string): string =>
  slug
    .toLowerCase()
    .trim()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 150);

export const cleanSanityId = (sanityId: string): string =>
  sanityId.startsWith("drafts.") ? sanityId.slice("drafts.".length) : sanityId;

export const getSanityIdCandidates = (sanityId: string): string[] => {
  const cleanId = cleanSanityId(sanityId);
  const withHyphens = cleanId.replace(/_/g, "-");
  const withUnderscores = cleanId.replace(/-/g, "_");
  return [...new Set([sanityId, cleanId, withHyphens, withUnderscores])];
};

export const extractCategorySlug = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;

  const currentSlug = getString(value.current);
  if (currentSlug) return currentSlug;

  const slug = value.slug;
  if (typeof slug === "string") return slug;
  if (isRecord(slug)) return getString(slug.current);
  return undefined;
};

export const getLocalizedText = (
  value: unknown,
  language: "en" | "fr" | "ar",
  maxLength = 1000,
): string => {
  let extracted = "";
  if (isRecord(value)) {
    extracted =
      getString(value[language])?.trim() ||
      getString(value[`_${language}`])?.trim() ||
      "";
  } else if (language === "en") {
    extracted = getString(value)?.trim() || "";
  }
  return sanitizeText(extracted, maxLength);
};

export const getWebhookOperation = (
  payload: Record<string, any>,
  sanityOperationHeader?: string,
): OperationTypes => {
  if (
    sanityOperationHeader === "create" ||
    sanityOperationHeader === "update" ||
    sanityOperationHeader === "delete"
  ) {
    return sanityOperationHeader;
  }

  if (
    payload._deleted === true ||
    payload.deleted === true ||
    [
      payload._action,
      payload.action,
      payload.eventType,
      payload._operation,
    ].some((v) => v?.toLowerCase() === "delete")
  ) {
    return "delete";
  }

  const explicit =
    payload._action || payload.action || payload._operation || payload.operation;
  if (
    explicit === "create" ||
    explicit === "update" ||
    explicit === "batch" ||
    explicit === "delete"
  ) {
    return explicit as OperationTypes;
  }

  return "create";
};