import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { Logger } from "@medusajs/framework/types";
import { sanitySyncProductWorkflow } from "../../workflows/sanity-sync";
import { sanitySyncCategoryWorkflow } from "../../workflows/sanity-sync/category-workflow";
import {
  SanitySyncWorkflowInput,
  SanityProductPayload,
  SanityImagePayload,
  SanityRawProductInput,
  SanityRawImageInput,
  SanityCategoryPayload,
  SanityLocalizedString,
  SanitySEOPayload,
  SanityOpenGraphImage,
} from "../../workflows/sanity-sync/types";

import { syncLock } from "../../utils/sync-lock";
import { getSanityImageFallbackUrl } from "../../utils/backend-url";

export interface SanityRawWebhookReference {
  _key?: string;
  _ref?: string;
  _id?: string;
  _type: "reference";
}
interface SanitySyncWebhookPayload extends Partial<SanityRawProductInput> {
  operation?: string;
  _action?: string;
  action?: string;
  eventType?: string;
  _operation?: string;
  _deleted?: boolean;
  deleted?: boolean;
  _updatedBy?: string;
  _rev?: string;
  updatedBy?: string;
  syncOrigin?: string;
  _perspectives?: string | string[];
  documentType?: string;
  _type?: string;
  documentIds?: unknown;
  batchProducts?: unknown;
  batchCategories?: unknown;
  documents?: unknown;
  productData?: SanityRawProductInput;
  mutations?: Array<{
    patch?: {
      id?: string;
      set?: Record<string, any>;
      setIfMissing?: Record<string, any>;
      [key: string]: any;
    };
    [key: string]: any;
  }>;
}

interface AuthenticatedSyncRequest extends MedusaRequest<SanitySyncWebhookPayload> {
  rawBody?: Buffer | string;
}

type OperationTypes = "update" | "create" | "batch" | "delete";
type DocumentType = "product" | "category";

export type SanityRawWebhookImage = SanityRawImageInput;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const getLocalizedText = (
  value: unknown,
  language: "en" | "fr" | "ar",
): string => {
  if (isRecord(value)) {
    return (
      getString(value[language])?.trim() ||
      getString(value[`_${language}`])?.trim() ||
      ""
    );
  }
  return language === "en" ? getString(value)?.trim() || "" : "";
};

const getWebhookOperation = (
  payload: SanitySyncWebhookPayload,
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
    ].some((value) => value?.toLowerCase() === "delete")
  ) {
    return "delete";
  }

  const explicitAction =
    payload._action || payload.action || payload._operation;
  const operation = explicitAction || payload.operation;
  if (
    operation === "create" ||
    operation === "update" ||
    operation === "batch" ||
    operation === "delete"
  ) {
    return operation as OperationTypes;
  }

  return "create";
};

const getSanityIdCandidates = (sanityId: string): string[] => {
  const cleanId = cleanSanityId(sanityId);
  const withHyphens = cleanId.replace(/_/g, "-");
  const withUnderscores = cleanId.replace(/-/g, "_");
  return [...new Set([sanityId, cleanId, withHyphens, withUnderscores])];
};

const cleanSanityId = (sanityId: string): string =>
  sanityId.startsWith("drafts.") ? sanityId.slice("drafts.".length) : sanityId;

const extractCategorySlug = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;

  const currentSlug = getString(value.current);
  if (currentSlug) return currentSlug;

  const slug = value.slug;
  if (typeof slug === "string") return slug;
  if (isRecord(slug)) return getString(slug.current);
  return undefined;
};

const sanitizeHandle = (slug: string): string =>
  slug
    .toLowerCase()
    .trim()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

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

const getSafeImageUrl = (
  token: string | undefined,
  projectId: string,
  dataset: string,
  fallbackUrl: string,
): string => {
  if (!token) return fallbackUrl;
  if (/^https?:\/\//i.test(token)) return token;
  return getSanityCdnUrl(token, projectId, dataset, fallbackUrl);
};

const DEFAULT_FALLBACK = getSanityImageFallbackUrl();
const getSanityCdnUrl = (
  refId: string,
  projectId: string,
  dataset: string,
  fallbackUrl: string,
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
  } catch (e) {
    return fallbackUrl;
  }
};

export async function POST(
  req: AuthenticatedSyncRequest,
  res: MedusaResponse,
): Promise<void> {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const queryEngine = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  let eventLease: { key: string; token: string } | undefined;
  const syncLeases: Array<{ key: string; token: string }> = [];

  const projectId =
    process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;

  const dataset =
    process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || "";

  const imgFallbackUrl = DEFAULT_FALLBACK;
  const tokenHeader = req.headers["x-sanity-sync-token"];
  const suppliedToken = Array.isArray(tokenHeader)
    ? tokenHeader[0]
    : tokenHeader;
  const signatureHeader = req.headers["sanity-webhook-signature"];
  const signature = Array.isArray(signatureHeader)
    ? signatureHeader[0]
    : signatureHeader;
  const tokenSecret =
    process.env.SANITY_SYNC_SECRET_TOKEN || process.env.SANITY_WEBHOOK_SECRET;
  const webhookSecret =
    process.env.SANITY_WEBHOOK_SECRET || process.env.SANITY_SYNC_SECRET_TOKEN;
  const rawBody = req.rawBody;
  const rawBodyString =
    typeof rawBody === "string" ? rawBody : rawBody?.toString("utf8");
  const requestFingerprint = rawBodyString
    ? createHash("sha256").update(rawBodyString).digest("hex")
    : undefined;
  const constantTimeEqual = (supplied: string, expected: string): boolean => {
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    return (
      suppliedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(suppliedBuffer, expectedBuffer)
    );
  };
  const isValidToken =
    Boolean(suppliedToken && tokenSecret) &&
    constantTimeEqual(suppliedToken || "", tokenSecret || "");
  let isValidSignature = false;

  if (signature && webhookSecret && rawBodyString !== undefined) {
    const suppliedSignature = signature.replace(/^sha256=/i, "");
    if (/^[\da-f]{64}$/i.test(suppliedSignature)) {
      const expectedSignature = createHmac("sha256", webhookSecret)
        .update(rawBodyString)
        .digest("hex");
      isValidSignature = constantTimeEqual(
        suppliedSignature,
        expectedSignature,
      );
    }
  }

  if (!tokenSecret && !webhookSecret) {
    logger.error(
      "[Sanity Sync Hook] Webhook signing secret is not configured.",
    );
    res.status(500).json({ error: "Webhook signing is not configured." });
    return;
  }

  if (!rawBodyString) {
    logger.warn("[Sanity Sync Hook] Request is missing its raw body.");
    res.status(400).json({ error: "A raw request body is required." });
    return;
  }

  if (!isValidToken && !isValidSignature) {
    logger.warn(
      "[Sanity Sync Hook] Unauthorized Sanity CMS Sync Attempt Blocked.",
    );
    res.status(401).send("Unauthorized");
    return;
  }

  if (!projectId) {
    logger.error(
      "[Sanity Sync Hook] Critical error: SANITY_PROJECT_ID environment variable is missing.",
    );
    res
      .status(500)
      .json({ error: "System integration variable gap encountered." });
    return;
  }

  try {
    const requestBody: unknown = req.body;
    if (!isRecord(requestBody)) {
      res.status(400).json({ error: "Webhook payload must be a JSON object." });
      return;
    }
    const rawPayload = requestBody as unknown as SanitySyncWebhookPayload;

    const sanityOperationHeader = req.headers["sanity-operation"];
    const sanityDocumentIdHeader = req.headers["sanity-document-id"];

    const sanityDocumentId = getString(
      Array.isArray(sanityDocumentIdHeader)
        ? sanityDocumentIdHeader[0]
        : sanityDocumentIdHeader,
    );

    const sanityOperation = Array.isArray(sanityOperationHeader)
      ? sanityOperationHeader[0]
      : sanityOperationHeader;

    const nestedProduct = isRecord(rawPayload.productData)
      ? rawPayload.productData
      : undefined;
    const uncheckedBody = rawPayload as Record<string, any>;
    const incomingId =
      getString(nestedProduct?._id) || getString(uncheckedBody._id) || "";

    const isBackgroundEchoWebhook =
      uncheckedBody.event === "product.updated" ||
      (uncheckedBody.action === "sync" && !incomingId);

    if (isBackgroundEchoWebhook) {
      res.status(200).json({
        success: true,
        syncStatus: "ignored",
        message: "Non-Sanity webhook event ignored.",
      });
      return;
    }

    const incomingCmsProduct: Partial<SanityRawProductInput> = nestedProduct
      ? ({
          ...rawPayload,
          ...nestedProduct,
          metadata: {
            ...(isRecord(rawPayload.metadata) ? rawPayload.metadata : {}),
            ...(isRecord(nestedProduct.metadata) ? nestedProduct.metadata : {}),
          },
        } as Partial<SanityRawProductInput>)
      : rawPayload;

    const documentId: string =
      sanityDocumentId || incomingCmsProduct?._id || rawPayload?._id || "";

    const cleanId = cleanSanityId(documentId);

    let resolvedRequestContextOperation: OperationTypes = getWebhookOperation(
      rawPayload,
      sanityOperation,
    );

    if (sanityOperation === "delete" || rawPayload.action === "delete") {
      resolvedRequestContextOperation = "delete";
    }

    const isDeletion =
      resolvedRequestContextOperation === "delete" ||
      rawPayload.action === "delete" ||
      rawPayload._action === "delete";
    const documentType =
      rawPayload.documentType ||
      (incomingCmsProduct._type === "category" ? "category" : "product");

    const incomingMetadata: Record<string, unknown> = isRecord(
      incomingCmsProduct.metadata,
    )
      ? incomingCmsProduct.metadata
      : {};
    const syncOrigin =
      getString(uncheckedBody.syncOrigin) ||
      getString(uncheckedBody.is_sync_origin) ||
      getString(incomingMetadata.is_sync_origin);
    logger.info(
      `[Sanity Sync Hook] Incoming document state: ${JSON.stringify({
        documentId: cleanId,
        documentType,
        operation: resolvedRequestContextOperation,
        revision: getString(rawPayload._rev) || null,
        syncOrigin: syncOrigin || null,
        correlationId: getString(uncheckedBody.correlationId) || null,
        requestFingerprint,
      })}`,
    );

    const echoCorrelationId = cleanId
      ? await syncLock.consume(`sanity-echo:${cleanId}`)
      : undefined;
    if (echoCorrelationId) {
      logger.info(
        `[Sanity Sync Hook] Ignoring outbound Medusa echo for ${cleanId}; correlationId=${echoCorrelationId}, syncOrigin=${syncOrigin || "unknown"}.`,
      );
      res.status(200).json({
        success: true,
        syncStatus: "ignored",
        message: "Acknowledged Medusa-originated Sanity mutation.",
      });
      return;
    }

    let operation: OperationTypes = resolvedRequestContextOperation;

    const urlPerspective = req.query?.perspective as string | undefined;
    const rawPerspectives = rawPayload._perspectives as unknown;
    let bodyPerspectives: string[] = [];
    if (Array.isArray(rawPerspectives)) {
      bodyPerspectives = rawPerspectives.map((p) => String(p).trim());
    } else if (typeof rawPerspectives === "string") {
      const cleanStr = rawPerspectives.trim();
      if (cleanStr !== "") bodyPerspectives = [cleanStr];
    }

    const isDraftId =
      documentId.startsWith("drafts.") || incomingId.startsWith("drafts.");
    const hasDraftPerspective =
      bodyPerspectives.includes("drafts") || urlPerspective === "drafts";

    if (isDraftId || hasDraftPerspective) {
      if (operation === "delete") {
        logger.info(
          `[Sanity Sync Guard] Bypassed implicit internal draft cleanup for Entity: [${incomingId}].`,
        );
        res.status(202).json({
          success: true,
          syncStatus: "deferred",
          reason: "unpublished_draft",
          message:
            "Draft documents are not synced to Medusa. Publish the Sanity document to sync the live version.",
        });
        return;
      }
      logger.info(
        `[Sanity Sync] Deferring execution for un-published draft: [${incomingId}].`,
      );
      res.status(202).json({
        success: true,
        syncStatus: "deferred",
        reason: "unpublished_draft",
        message:
          "Draft documents are not synced to Medusa. Publish the Sanity document to sync the live version.",
        sanityDocumentId: cleanId,
      });
      return;
    }

    const revision = getString(rawPayload._rev) || "";
    const eventIdentity = [
      cleanId,
      resolvedRequestContextOperation,
      revision,
      requestFingerprint || "",
    ].join(":");
    const eventKey = `sanity-event:${createHash("sha256")
      .update(eventIdentity)
      .digest("hex")}`;
    const claimedEvent = await syncLock.acquire(eventKey, 86400);
    if (!claimedEvent) {
      logger.info(
        `[Sanity Sync] Acknowledging duplicate delivery for ${documentType} ${cleanId}.`,
      );
      res.status(202).json({
        success: true,
        syncStatus: "duplicate",
        message:
          "This document revision and payload have already been processed or are in progress.",
      });
      return;
    }
    eventLease = { key: eventKey, token: claimedEvent };

    const cmsProduct: Partial<SanityRawProductInput> = cleanId
      ? {
          ...incomingCmsProduct,
          _id: cleanId,
          metadata: {
            ...incomingMetadata,
            sanity_id: cleanId,
            is_sync_origin: "sanity",
          },
        }
      : incomingCmsProduct;

    const targetLockKey = cleanId ? `${documentType}-${cleanId}` : null;

    if (targetLockKey) {
      const key = `sanity-sync:${targetLockKey}`;
      const token = await syncLock.acquire(key, 120);
      if (!token) {
        res.status(409).json({
          error: "A synchronization for this document is already in progress.",
        });
        return;
      }
      syncLeases.push({ key, token });
    }

    const standardPerspectives = ["raw", "published", "production"];
    const hasInvalidPerspective =
      (urlPerspective && !standardPerspectives.includes(urlPerspective)) ||
      (bodyPerspectives.length > 0 &&
        !bodyPerspectives.some((p) => standardPerspectives.includes(p)));

    if (hasInvalidPerspective) {
      res.status(200).json({
        success: true,
        syncStatus: "ignored",
        message:
          "Medusa catalog updates are exclusively locked to Published perspectives.",
      });
      return;
    }

    if (operation === "batch") {
      const batchItems =
        documentType === "category"
          ? (rawPayload.batchCategories ?? rawPayload.documents)
          : (rawPayload.batchProducts ?? rawPayload.documents);
      if (!Array.isArray(batchItems) || batchItems.length === 0) {
        res.status(400).json({
          error: `Batch ${documentType} sync requires a non-empty documents array.`,
        });
        return;
      }

      if (documentType === "category") {
        const categories = batchItems.filter(isRecord);
        if (categories.length !== batchItems.length) {
          res
            .status(400)
            .json({ error: "Every batch category must be an object." });
          return;
        }

        for (const category of categories) {
          const categoryId = getString(category._id);
          const slug = sanitizeHandle(extractCategorySlug(category.slug) || "");
          if (!categoryId || !slug) {
            res.status(400).json({
              error: "Every batch category requires an _id and slug.",
            });
            return;
          }
        }

        for (const category of categories) {
          const categoryId = cleanSanityId(getString(category._id)!);
          const key = `sanity-sync:category-${categoryId}`;
          const token = await syncLock.acquire(key, 120);
          if (!token) {
            res.status(409).json({
              error: `Category ${categoryId} is already being synchronized.`,
            });
            return;
          }
          syncLeases.push({ key, token });

          const titleValue = category.title;
          const localizedTitle = isRecord(titleValue) ? titleValue : {};
          const name =
            getString(localizedTitle.en) ||
            getString(titleValue) ||
            getString(localizedTitle.fr) ||
            getString(localizedTitle.ar) ||
            "Category";
          const descriptionValue = category.description;
          const localizedDescription = isRecord(descriptionValue)
            ? descriptionValue
            : {};

          await sanitySyncCategoryWorkflow(req.scope).run({
            input: {
              sanityId: categoryId,
              name,
              handle: sanitizeHandle(extractCategorySlug(category.slug) || ""),
              description:
                getString(localizedDescription.en) ||
                getString(descriptionValue) ||
                "",
              metadata: {
                sanity_id: categoryId,
                is_sync_origin: "sanity",
                translations: {
                  en: {
                    title: getString(localizedTitle.en) || name,
                    description: getString(localizedDescription.en) || "",
                  },
                  fr: {
                    title: getString(localizedTitle.fr) || "",
                    description: getString(localizedDescription.fr) || "",
                  },
                  ar: {
                    title: getString(localizedTitle.ar) || "",
                    description: getString(localizedDescription.ar) || "",
                  },
                },
                ...(isRecord(category.seo) ? { seo: category.seo } : {}),
              },
            },
          });
        }

        res.status(200).json({
          success: true,
          operation: "batch",
          documentType,
          processed: categories.length,
        });
        return;
      }

      const normalizedBatch: SanitySyncWorkflowInput[] = [];
      for (const rawBatchItem of batchItems) {
        if (!isRecord(rawBatchItem)) {
          res
            .status(400)
            .json({ error: "Every batch product must be an object." });
          return;
        }
        const product = rawBatchItem as unknown as SanityRawProductInput;
        const productId = cleanSanityId(getString(product._id) || "");
        const productSlug = sanitizeHandle(
          extractCategorySlug(product.slug) || "",
        );
        if (!productId || !productSlug) {
          res.status(400).json({
            error: "Every batch product requires an _id and slug.",
          });
          return;
        }

        const productCategories: SanityCategoryPayload[] = [];
        for (const rawCategory of product.categories ?? []) {
          const rawReference =
            typeof rawCategory === "string"
              ? rawCategory
              : rawCategory._ref || rawCategory._id;
          const categorySlug =
            typeof rawCategory === "string"
              ? undefined
              : extractCategorySlug(rawCategory.slug);
          let matched: { id: string; handle: string; name: string } | undefined;

          if (rawReference) {
            const cleanReference = String(rawReference)
              .replace(/^drafts\./, "")
              .replace(/^category-/, "");
            for (const candidate of getSanityIdCandidates(cleanReference)) {
              const { data: matches } = await queryEngine.graph({
                entity: "product_category",
                fields: ["id", "handle", "name"],
                filters: {
                  metadata: { sanity_id: candidate },
                } as Record<string, unknown>,
              });
              if (matches?.[0]) {
                matched = {
                  id: matches[0].id,
                  handle: matches[0].handle,
                  name: matches[0].name,
                };
                break;
              }
            }
          }
          if (!matched && categorySlug) {
            const { data: matches } = await queryEngine.graph({
              entity: "product_category",
              fields: ["id", "handle", "name"],
              filters: { handle: [categorySlug] },
            });
            if (matches?.[0]) {
              matched = {
                id: matches[0].id,
                handle: matches[0].handle,
                name: matches[0].name,
              };
            }
          }
          if (!matched) {
            res.status(400).json({
              error: `Batch product ${productId} references an unknown category.`,
            });
            return;
          }
          productCategories.push({
            _id: rawReference || matched.id,
            title: matched.name,
            slug: matched.handle,
            ...matched,
          } as SanityCategoryPayload);
        }

        if (productCategories.length === 0) {
          res.status(400).json({
            error: `Batch product ${productId} must reference a Medusa category.`,
          });
          return;
        }

        const inputMetadata: Record<string, unknown> = isRecord(
          product.metadata,
        )
          ? product.metadata
          : {};
        const inputTranslations: Record<string, unknown> = isRecord(
          inputMetadata.translations,
        )
          ? inputMetadata.translations
          : {};
        const localize = (
          value: unknown,
          locale: "en" | "fr" | "ar",
          field: "title" | "description" | "material",
        ): string => {
          const localized = isRecord(value)
            ? getString(value[locale])
            : undefined;
          const existingLocale = isRecord(inputTranslations[locale])
            ? getString(inputTranslations[locale][field])
            : undefined;
          if (localized !== undefined) return localized.trim();
          if (existingLocale !== undefined) return existingLocale.trim();
          return locale === "en" ? getString(value)?.trim() || "" : "";
        };
        const titleTranslations = {
          en: localize(product.title, "en", "title"),
          fr: localize(product.title, "fr", "title"),
          ar: localize(product.title, "ar", "title"),
        };
        const descriptionTranslations = {
          en: localize(product.description, "en", "description"),
          fr: localize(product.description, "fr", "description"),
          ar: localize(product.description, "ar", "description"),
        };
        const materialTranslations = {
          en: localize(product.material, "en", "material"),
          fr: localize(product.material, "fr", "material"),
          ar: localize(product.material, "ar", "material"),
        };
        const images = (product.images ?? []).flatMap((image, index) => {
          const token = extractImageToken(image);
          if (!token) return [];
          const alt = isRecord(image.alt) ? image.alt : {};
          const assetRef =
            image.asset?._ref ||
            (typeof image._ref === "string" ? image._ref : "");
          const englishAlt =
            image.alt_en || getString(alt.en) || getString(image.alt) || "";
          return [
            {
              _type: "image",
              _key: image._key || `batch_${productId}_${index}`,
              id: image._key || `batch_${productId}_${index}`,
              url: getSafeImageUrl(token, projectId, dataset, imgFallbackUrl),
              alt: englishAlt,
              alt_en: englishAlt,
              alt_fr: image.alt_fr || getString(alt.fr) || "",
              alt_ar: image.alt_ar || getString(alt.ar) || "",
              asset: assetRef
                ? { _type: "reference", _ref: assetRef }
                : undefined,
            },
          ];
        });
        const variants = (product.variants ?? []).map(
          (variant, variantIndex) => ({
            ...variant,
            images: (variant.images ?? []).flatMap((image, imageIndex) => {
              const token = extractImageToken(image);
              if (!token) return [];
              const alt = isRecord(image.alt) ? image.alt : {};
              const assetRef =
                image.asset?._ref ||
                (typeof image._ref === "string" ? image._ref : "");
              const englishAlt =
                image.alt_en || getString(alt.en) || getString(image.alt) || "";
              return [
                {
                  _type: "image" as const,
                  _key:
                    image._key ||
                    `batch_${productId}_variant_${variantIndex}_${imageIndex}`,
                  id:
                    image._key ||
                    `batch_${productId}_variant_${variantIndex}_${imageIndex}`,
                  url: getSafeImageUrl(
                    token,
                    projectId,
                    dataset,
                    imgFallbackUrl,
                  ),
                  alt: englishAlt,
                  alt_en: englishAlt,
                  alt_fr: image.alt_fr || getString(alt.fr) || "",
                  alt_ar: image.alt_ar || getString(alt.ar) || "",
                  asset: assetRef
                    ? { _type: "reference", _ref: assetRef }
                    : undefined,
                },
              ];
            }),
          }),
        );

        const metadata = {
          ...inputMetadata,
          sanity_id: productId,
          is_sync_origin: "sanity" as const,
          translations: {
            ...inputTranslations,
            en: {
              ...(isRecord(inputTranslations.en) ? inputTranslations.en : {}),
              title: titleTranslations.en || "",
              description: descriptionTranslations.en || "",
              material: materialTranslations.en || "",
            },
            fr: {
              ...(isRecord(inputTranslations.fr) ? inputTranslations.fr : {}),
              title: titleTranslations.fr || "",
              description: descriptionTranslations.fr || "",
              material: materialTranslations.fr || "",
            },
            ar: {
              ...(isRecord(inputTranslations.ar) ? inputTranslations.ar : {}),
              title: titleTranslations.ar || "",
              description: descriptionTranslations.ar || "",
              material: materialTranslations.ar || "",
            },
          },
        };
        const standardizedProduct: SanityProductPayload = {
          _id: productId,
          title: titleTranslations.en,
          subtitle: titleTranslations.fr || "",
          description: descriptionTranslations.en || "",
          material: materialTranslations.en || "",
          slug: productSlug,
          tags: Array.isArray(product.tags)
            ? product.tags.map((tag) => String(tag))
            : [],
          highlights: Array.isArray(product.highlights)
            ? product.highlights
            : [],
          seo: product.seo || {},
          productType: product.productType,
          weightGrams: product.weightGrams,
          lengthMm: product.lengthMm,
          widthMm: product.widthMm,
          heightMm: product.heightMm,
          originCountry: product.originCountry,
          images,
          categories: productCategories,
          variantOptions: product.variantOptions || [],
          variants,
          metadata,
          manage_inventory: product.manage_inventory ?? true,
          allow_backorder: product.allow_backorder ?? false,
        };
        const key = `sanity-sync:product-${productId}`;
        const token = await syncLock.acquire(key, 120);
        if (!token) {
          res.status(409).json({
            error: `Product ${productId} is already being synchronized.`,
          });
          return;
        }
        syncLeases.push({ key, token });
        normalizedBatch.push({
          operation: "create",
          documentType: "product",
          productData: standardizedProduct,
          categoryIds: productCategories.flatMap((category) =>
            typeof category.id === "string" ? [category.id] : [],
          ),
        });
      }

      for (const batchInput of normalizedBatch) {
        await sanitySyncProductWorkflow(req.scope).run({ input: batchInput });
      }
      res.status(200).json({
        success: true,
        operation: "batch",
        documentType,
        processed: normalizedBatch.length,
      });
      return;
    }
    // CATEGORY ROUTING
    if (documentType === "category") {
      const extractedCategorySlug =
        extractCategorySlug(cmsProduct?.slug)?.toLowerCase().trim() || "";

      const rawCategoryTitlePayload =
        cmsProduct?.title || rawPayload.productData?.title || rawPayload.title;
      let categoryTitle = "Category";
      if (
        typeof rawCategoryTitlePayload === "string" &&
        rawCategoryTitlePayload.trim() !== ""
      ) {
        categoryTitle = rawCategoryTitlePayload.trim();
      } else if (
        rawCategoryTitlePayload &&
        typeof rawCategoryTitlePayload === "object"
      ) {
        const localizedObj = rawCategoryTitlePayload as SanityLocalizedString;
        if (localizedObj.en && localizedObj.en.trim() !== "") {
          categoryTitle = localizedObj.en.trim();
        }
      }

      const rawCategoryDesc =
        cmsProduct?.description ||
        rawPayload.productData?.description ||
        rawPayload.description;
      let categoryDescription = "";
      if (typeof rawCategoryDesc === "string") {
        categoryDescription = rawCategoryDesc.trim();
      } else if (rawCategoryDesc && typeof rawCategoryDesc === "object") {
        categoryDescription = (
          rawCategoryDesc.en ||
          rawCategoryDesc.fr ||
          rawCategoryDesc.ar ||
          ""
        ).trim();
      }

      if (operation === "delete" || isDeletion) {
        const sanityDocId = cleanId;
        let targetCategory:
          | { id: string; handle: string; products?: { id: string }[] }
          | undefined;

        for (const candidateId of getSanityIdCandidates(sanityDocId)) {
          const { data: categories } = await queryEngine.graph({
            entity: "product_category",
            fields: ["id", "handle", "products.id"],
            filters: {
              metadata: { sanity_id: candidateId },
            } as Record<string, unknown>,
          });
          targetCategory = categories?.[0];
          if (targetCategory) break;
        }

        if (!targetCategory && extractedCategorySlug) {
          const { data: categories } = await queryEngine.graph({
            entity: "product_category",
            fields: ["id", "handle", "products.id"],
            filters: { handle: [extractedCategorySlug] },
          });
          targetCategory = categories?.[0];
        }

        if (!targetCategory) {
          res.status(200).json({
            success: true,
            message: "Category deletion synced successfully.",
            operation: "delete",
          });
          return;
        }

        if (targetCategory.products?.length) {
          res.status(400).json({
            success: false,
            message: "Cannot delete a category with assigned products",
          });
          return;
        }

        const deletionInput: SanitySyncWorkflowInput = {
          operation: "delete",
          documentType: "category",
          deletionTargetId: targetCategory.id,
          productData: {
            _id: sanityDocId,
            slug: targetCategory.handle,
            title: categoryTitle || "Category Deletion Reference",
            description: { en: "", fr: "", ar: "" },
            categories: [],
            metadata: {
              sanity_id: sanityDocId,
              is_sync_origin: "sanity",
            },
          } as unknown as SanityProductPayload,
        };
        await sanitySyncProductWorkflow(req.scope).run({
          input: deletionInput,
        });

        res.status(200).json({
          success: true,
          message: "Category deletion synced successfully.",
          operation: "delete",
        });
        return;
      }

      if (operation === "create" || operation === "update") {
        if (!extractedCategorySlug) {
          res.status(400).json({
            success: false,
            error: "Category handle cannot be empty.",
          });
          return;
        }
        const sanityId = cmsProduct?._id || "";
        const titleTranslations =
          typeof rawCategoryTitlePayload === "object" &&
          rawCategoryTitlePayload !== null
            ? {
                en: getString(rawCategoryTitlePayload.en) || "",
                fr: getString(rawCategoryTitlePayload.fr) || "",
                ar: getString(rawCategoryTitlePayload.ar) || "",
              }
            : { en: categoryTitle, fr: "", ar: "" };
        const descriptionTranslations =
          typeof rawCategoryDesc === "object" && rawCategoryDesc !== null
            ? {
                en: getString(rawCategoryDesc.en) || "",
                fr: getString(rawCategoryDesc.fr) || "",
                ar: getString(rawCategoryDesc.ar) || "",
              }
            : { en: categoryDescription, fr: "", ar: "" };

        await sanitySyncCategoryWorkflow(req.scope).run({
          input: {
            sanityId,
            name: categoryTitle,
            handle: extractedCategorySlug,
            description: categoryDescription,
            metadata: {
              sanity_id: sanityId,
              is_sync_origin: "sanity",
              translations: {
                ...(isRecord(incomingMetadata.translations)
                  ? incomingMetadata.translations
                  : {}),
                en: {
                  title: titleTranslations.en,
                  description: descriptionTranslations.en || "",
                },
                fr: {
                  title: titleTranslations.fr || "",
                  description: descriptionTranslations.fr || "",
                },
                ar: {
                  title: titleTranslations.ar || "",
                  description: descriptionTranslations.ar || "",
                },
              },
              ...(cmsProduct.seo ? { seo: cmsProduct.seo } : {}),
            },
          },
        });
        res.status(200).json({
          success: true,
          message: "Category sync complete",
          operation,
        });
        return;
      }
    }

    // PRODUCT DELETION
    if (operation === "delete" && documentType === "product") {
      let targetProduct: { id: string; handle: string } | undefined;

      if (cleanId.startsWith("prod_")) {
        const { data: existingProducts } = await queryEngine.graph({
          entity: "product",
          fields: ["id", "handle"],
          filters: { id: cleanId },
        });
        targetProduct = existingProducts?.[0];
      }

      if (!targetProduct) {
        for (const candidateId of getSanityIdCandidates(cleanId)) {
          const { data: existingProducts } = await queryEngine.graph({
            entity: "product",
            fields: ["id", "handle"],
            filters: { metadata: { sanity_id: candidateId } } as Record<
              string,
              any
            >,
          });
          targetProduct = existingProducts?.[0];
          if (targetProduct) break;
        }
      }

      if (!targetProduct) {
        res.status(200).json({
          success: true,
          message: "Product deletion synced successfully.",
        });
        return;
      }

      const deletionInput: SanitySyncWorkflowInput = {
        operation: "delete",
        documentType: "product",
        deletionTargetId: targetProduct.id,
        productData: {
          _id: targetProduct.id,
          slug: targetProduct.handle,
          title: { en: "Deletion Reference" },
          description: { en: "" },
          categories: [],
          metadata: {
            sanity_id: targetProduct.id,
            is_sync_origin: "sanity",
          },
        },
      };
      await sanitySyncProductWorkflow(req.scope).run({ input: deletionInput });
      res.status(200).json({
        success: true,
        message: "Product deletion synced successfully.",
        operation: "delete",
      });
      return;
    }

    // PRODUCT CREATE / UPDATE RESOLUTION
    const rawCategories = cmsProduct.categories || rawPayload.categories || [];
    const categoryPayload: SanityCategoryPayload[] = [];

    if (Array.isArray(rawCategories)) {
      for (const rawCategory of rawCategories) {
        if (!rawCategory) continue;

        const rawRef =
          typeof rawCategory === "object"
            ? rawCategory._ref || rawCategory._id
            : rawCategory;
        const rawCategorySlug =
          typeof rawCategory === "object"
            ? extractCategorySlug(rawCategory.slug)
            : undefined;

        let matchedCategory:
          { id: string; handle: string; name?: string } | undefined;

        // 1. Try resolving by Sanity Candidate IDs
        if (rawRef) {
          const cleanRef = String(rawRef)
            .replace(/^drafts\./, "")
            .replace(/^category-/, "");
          for (const candidateId of getSanityIdCandidates(cleanRef)) {
            const { data: matched } = await queryEngine.graph({
              entity: "product_category",
              fields: ["id", "handle", "name"],
              filters: { metadata: { sanity_id: candidateId } } as Record<
                string,
                unknown
              >,
            });
            if (matched?.[0]) {
              matchedCategory = {
                id: matched[0].id,
                handle: matched[0].handle,
                name: matched[0].name,
              };
              break;
            }
          }
        }

        // 2. Fallback: Try resolving by category handle/slug
        if (!matchedCategory && rawCategorySlug) {
          const { data: matchedBySlug } = await queryEngine.graph({
            entity: "product_category",
            fields: ["id", "handle", "name"],
            filters: { handle: [rawCategorySlug] },
          });
          if (matchedBySlug?.[0]) {
            matchedCategory = {
              id: matchedBySlug[0].id,
              handle: matchedBySlug[0].handle,
              name: matchedBySlug[0].name,
            };
          }
        }

        if (matchedCategory) {
          categoryPayload.push(matchedCategory as SanityCategoryPayload);
        }
      }
    }

    if (categoryPayload.length === 0) {
      res.status(400).json({
        success: false,
        error:
          "Product references must resolve to an existing Medusa category.",
      });
      return;
    }

    const rawSlug =
      extractCategorySlug(cmsProduct.slug) || `prod-${cmsProduct._id}`;
    const normalizedSlug = sanitizeHandle(rawSlug);

    const resolvedCategoryPayloads = categoryPayload.filter(
      (payload, index, self) =>
        self.findIndex((p) => p.id === payload.id) === index,
    );

    // Mapped Images
    const rawImages =
      cmsProduct.images ||
      rawPayload.productData?.images ||
      rawPayload.images ||
      [];
    const mappedImages: SanityImagePayload[] = [];

    if (Array.isArray(rawImages)) {
      rawImages.forEach((image: SanityRawImageInput, index: number) => {
        if (!image) return;
        const resolvedToken =
          image.url ||
          (image.asset && (image.asset._ref || image.asset._id)) ||
          (image._ref as string) ||
          (image._id as string);

        if (resolvedToken && typeof resolvedToken === "string") {
          let cleanCdnUrl = resolvedToken.trim();

          if (!/^https?:\/\//i.test(cleanCdnUrl)) {
            cleanCdnUrl = getSafeImageUrl(
              cleanCdnUrl,
              projectId,
              dataset,
              imgFallbackUrl,
            );
          }
          const originalRef = image.asset?._ref || (image._ref as string) || "";
          const resolvedEnText =
            getLocalizedText(image.alt, "en") ||
            getString(image.alt_en)?.trim() ||
            "Product catalog image";
          const localizedAlt = isRecord(image.alt) ? image.alt : {};

          const computedKey =
            (image._key as string) || `img_${index}_${Date.now()}`;

          mappedImages.push({
            _type: "image",
            _key: computedKey,
            id: (image.id as string) || computedKey,
            url: cleanCdnUrl,
            alt: resolvedEnText,
            alt_en: resolvedEnText,
            alt_fr:
              getString(localizedAlt.fr)?.trim() ||
              getString(image.alt_fr)?.trim() ||
              "",
            alt_ar:
              getString(localizedAlt.ar)?.trim() ||
              getString(image.alt_ar)?.trim() ||
              "",
            asset: originalRef
              ? { _type: "reference", _ref: originalRef }
              : undefined,
          });
        }
      });
    }

    const image_metadata = mappedImages.map((img) => ({
      url: img.url,
      sanity_asset_id: img.asset?._ref || img._key || "",
      alt: {
        en: img.alt_en || img.alt || "",
        fr: img.alt_fr || "",
        ar: img.alt_ar || "",
      },
    }));

    const mappedVariants = (cmsProduct.variants ?? []).map(
      (variant, variantIndex) => {
        const swatch = isRecord(variant.swatchImage)
          ? variant.swatchImage
          : undefined;
        const swatchToken = swatch ? extractImageToken(swatch) : undefined;
        const swatchAssetId =
          isRecord(swatch?.asset) && typeof swatch.asset._ref === "string"
            ? swatch.asset._ref
            : undefined;
        const swatchImage = swatchToken
          ? {
              url: getSafeImageUrl(
                swatchToken,
                projectId,
                dataset,
                imgFallbackUrl,
              ),
              sanity_asset_id: swatchAssetId || swatchToken,
              alt: {
                en: getLocalizedText(swatch?.alt, "en"),
                fr: getLocalizedText(swatch?.alt, "fr"),
                ar: getLocalizedText(swatch?.alt, "ar"),
              },
            }
          : undefined;
        const variantImages = (variant.images ?? []).flatMap(
          (image, imageIndex) => {
            const token = extractImageToken(image);
            if (!token) return [];
            const assetRef =
              image.asset?._ref ||
              (typeof image._ref === "string" ? image._ref : "");
            const alt = isRecord(image.alt) ? image.alt : {};
            const englishAlt =
              getLocalizedText(image.alt, "en") ||
              getString(image.alt_en)?.trim() ||
              "Variant image";

            return [
              {
                _type: "image" as const,
                _key:
                  image._key || `variant_${variantIndex}_image_${imageIndex}`,
                id: image._key || `variant_${variantIndex}_image_${imageIndex}`,
                url: getSafeImageUrl(token, projectId, dataset, imgFallbackUrl),
                alt: englishAlt,
                alt_en: englishAlt,
                alt_fr:
                  getString(alt.fr)?.trim() ||
                  getString(image.alt_fr)?.trim() ||
                  "",
                alt_ar:
                  getString(alt.ar)?.trim() ||
                  getString(image.alt_ar)?.trim() ||
                  "",
                asset: assetRef
                  ? { _type: "reference", _ref: assetRef }
                  : undefined,
              },
            ];
          },
        );
        return {
          ...variant,
          variantId:
            variant.medusa_variant_id || variant.variantId || variant._key,
          images: variantImages,
          metadata: {
            ...(isRecord(variant.metadata) ? variant.metadata : {}),
            sanity_variant_content: {
              description: {
                en: getLocalizedText(variant.description, "en"),
                fr: getLocalizedText(variant.description, "fr"),
                ar: getLocalizedText(variant.description, "ar"),
              },
              details: {
                en: getLocalizedText(variant.details, "en"),
                fr: getLocalizedText(variant.details, "fr"),
                ar: getLocalizedText(variant.details, "ar"),
              },
              badge: {
                en: getLocalizedText(variant.badge, "en"),
                fr: getLocalizedText(variant.badge, "fr"),
                ar: getLocalizedText(variant.badge, "ar"),
              },
              colorHex: getString(variant.colorHex) || "",
              swatchImage: swatchImage ?? null,
            },
          },
        };
      },
    );
    const mappedAllImages = [
      ...new Map(
        [
          ...mappedImages,
          ...mappedVariants.flatMap((variant) => variant.images ?? []),
        ].map((image) => [image.url, image]),
      ).values(),
    ];
    const variantImageMetadata = Object.fromEntries(
      mappedVariants.map((variant, index) => [
        variant.variantId ||
          variant.medusa_variant_id ||
          variant._key ||
          `variant_${index}`,
        (variant.images ?? []).map((image) => ({
          url: image.url,
          sanity_asset_id: image.asset?._ref || image._key || "",
          alt: {
            en: image.alt || "",
            fr: image.alt_fr || "",
            ar: image.alt_ar || "",
          },
        })),
      ]),
    );

    const incomingMetaTrans = isRecord(
      incomingCmsProduct.metadata?.translations,
    )
      ? incomingCmsProduct.metadata.translations
      : {};
    const translatedText = (
      field: unknown,
      lang: "en" | "fr" | "ar",
      key: string,
    ): string => {
      if (
        isRecord(field) &&
        Object.prototype.hasOwnProperty.call(field, lang)
      ) {
        return getLocalizedText(field, lang);
      }
      if (lang === "en" && typeof field === "string") {
        return field.trim();
      }
      const localized = isRecord(incomingMetaTrans[lang])
        ? getString(incomingMetaTrans[lang][key])?.trim()
        : undefined;
      return localized || "";
    };

    const titleEn = translatedText(cmsProduct.title, "en", "title");
    const titleFr = translatedText(cmsProduct.title, "fr", "title");
    const titleAr = translatedText(cmsProduct.title, "ar", "title");
    const descEn = translatedText(cmsProduct.description, "en", "description");
    const descFr = translatedText(cmsProduct.description, "fr", "description");
    const descAr = translatedText(cmsProduct.description, "ar", "description");

    const rawHighlights =
      incomingCmsProduct.highlights ||
      cmsProduct.highlights ||
      incomingMetadata.highlights ||
      [];

    const rawSeo: SanitySEOPayload =
      incomingCmsProduct.seo || cmsProduct.seo || incomingMetadata.seo || {};

    const keywords: string[] = Array.isArray(rawSeo.keywords)
      ? rawSeo.keywords
          .map((keyword: unknown) =>
            typeof keyword === "string" ? keyword.trim() : "",
          )
          .filter(Boolean)
      : [];

    const rawOg = rawSeo.openGraphImage as SanityOpenGraphImage;
    let ogUrl = "";
    let ogAssetId = "";

    if (rawOg) {
      ogAssetId = rawOg.assetId || rawOg.asset?._ref || "";
      const token = rawOg.url || ogAssetId;
      ogUrl = token
        ? getSafeImageUrl(token, projectId, dataset, imgFallbackUrl)
        : "";
    }

    if (!ogUrl && mappedImages.length > 0) {
      ogUrl = mappedImages[0].url;
      ogAssetId = mappedImages[0].asset?._ref || "";
    }

    const seoPayload: SanitySEOPayload = {
      metaTitle: rawSeo.metaTitle,
      metaDescription: rawSeo.metaDescription,
      keywords,
      openGraphImage: {
        url: ogUrl,
        assetId: ogAssetId,
        ...(ogAssetId
          ? { asset: { _type: "reference", _ref: ogAssetId } }
          : {}),
      },
    };

    const materialEn = translatedText(cmsProduct.material, "en", "material");
    const materialAr = translatedText(cmsProduct.material, "ar", "material");
    const materialFr = translatedText(cmsProduct.material, "fr", "material");

    const rawTags =
      incomingCmsProduct.tags || cmsProduct.tags || incomingMetadata.tags || [];
    const stringTags: string[] = Array.isArray(rawTags)
      ? rawTags
          .map((t: any) =>
            typeof t === "string"
              ? t.trim()
              : t?.value
                ? String(t.value).trim()
                : "",
          )
          .filter(Boolean)
      : [];

    const standardizedProductData: SanityProductPayload = {
      _id: cmsProduct._id as string,
      title: titleEn,
      material: materialEn || "",
      subtitle: titleFr || "",
      description: descEn || "",
      slug: normalizedSlug,
      tags: stringTags as any,
      highlights: incomingCmsProduct.highlights,
      seo: seoPayload,
      productType:
        incomingCmsProduct.productType || cmsProduct.productType || "",
      metadata: {
        ...incomingMetadata,
        sanity_id: cleanId,
        is_sync_origin: "sanity",
        productType: incomingCmsProduct.productType || null,
        tags: stringTags,
        highlights: rawHighlights,
        seo: seoPayload,
        images: mappedAllImages,
        translations: {
          en: { title: titleEn, description: descEn, material: materialEn },
          fr: { title: titleFr, description: descFr, material: materialFr },
          ar: { title: titleAr, description: descAr, material: materialAr },
        },
        title_en: titleEn,
        title_fr: titleFr,
        title_ar: titleAr,
        description_en: descEn,
        description_fr: descFr,
        description_ar: descAr,
        material_en: materialEn,
        material_fr: materialFr,
        material_ar: materialAr,
        image_metadata: mappedAllImages.map((image) => ({
          url: image.url,
          sanity_asset_id: image.asset?._ref || image._key || "",
          alt: {
            en: image.alt || "",
            fr: image.alt_fr || "",
            ar: image.alt_ar || "",
          },
        })),
        variant_images: variantImageMetadata,
      },
      weightGrams: cmsProduct.weightGrams,
      lengthMm: cmsProduct.lengthMm,
      widthMm: cmsProduct.widthMm,
      heightMm: cmsProduct.heightMm,
      originCountry: cmsProduct.originCountry?.toLowerCase(),
      categories: resolvedCategoryPayloads,
      images: mappedAllImages,
      variantOptions: cmsProduct.variantOptions || [],
      variants: mappedVariants,
      syncFieldsPresent: {
        tags: Object.prototype.hasOwnProperty.call(incomingCmsProduct, "tags"),
        images: Object.prototype.hasOwnProperty.call(
          incomingCmsProduct,
          "images",
        ),
        variants: Object.prototype.hasOwnProperty.call(
          incomingCmsProduct,
          "variants",
        ),
      },
      manage_inventory: cmsProduct.manage_inventory ?? true,
      allow_backorder: cmsProduct.allow_backorder ?? false,
    };

    let targetMedusaProductId: string | undefined;

    // 1. Direct Medusa ID check
    if (cleanId.startsWith("prod_")) {
      const { data: byId } = await queryEngine.graph({
        entity: "product",
        fields: ["id"],
        filters: { id: cleanId },
      });
      targetMedusaProductId = byId?.[0]?.id;
    }

    // 2. Lookup by metadata.sanity_id
    if (!targetMedusaProductId) {
      for (const candidateId of getSanityIdCandidates(cleanId)) {
        const { data: matchedProducts } = await queryEngine.graph({
          entity: "product",
          fields: ["id"],
          filters: { metadata: { sanity_id: candidateId } } as Record<
            string,
            any
          >,
        });
        if (matchedProducts?.[0]?.id) {
          targetMedusaProductId = matchedProducts[0].id;
          break;
        }
      }
    }

    // 3. Fallback: Lookup by Handle (PREVENTS "already exists" CRASH)
    if (!targetMedusaProductId && normalizedSlug) {
      const { data: matchedByHandle } = await queryEngine.graph({
        entity: "product",
        fields: ["id"],
        filters: { handle: [normalizedSlug] },
      });
      if (matchedByHandle?.[0]?.id) {
        targetMedusaProductId = matchedByHandle[0].id;
      }
    }

    // If product exists in Medusa, switch operation to "update"
    if (targetMedusaProductId && operation === "create") {
      operation = "update";
    }

    const resolvedCategoryIds: string[] = resolvedCategoryPayloads.flatMap(
      (c) => (typeof c.id === "string" ? [c.id] : []),
    );

    const standardizedInput: SanitySyncWorkflowInput = {
      operation: operation as OperationTypes,
      documentType: documentType as DocumentType,
      productData: {
        ...standardizedProductData,
        metadata: standardizedProductData.metadata,
      },
      categoryIds: resolvedCategoryIds,
    };

    if (targetMedusaProductId && documentType === "product") {
      await syncLock.mark(
        `sanity-inbound-product:${targetMedusaProductId}`,
        eventIdentity,
        15,
      );
    }

    const workflowResponse = await sanitySyncProductWorkflow(req.scope).run({
      input: standardizedInput,
    });

    const medusaOperation =
      (workflowResponse?.result as any)?.operation || operation;

    res.status(200).json({
      success: (workflowResponse?.result as any)?.success ?? true,
      message: `Sync execution complete; Medusa product ${medusaOperation}.`,
      operation: operation,
      medusaOperation,
    });
  } catch (error: unknown) {
    const errorDetails =
      error && typeof error === "object"
        ? JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
        : String(error);
    logger.error(
      `[Sanity Sync Hook] Route handler crashed during ingestion pass:\n${errorDetails}`,
    );

    res.status(500).json({
      error: "Core sync handling process crashed.",
      details: error instanceof Error ? error.message : error,
    });
  } finally {
    for (const lease of syncLeases) {
      await syncLock.release(lease.key, lease.token);
    }
    if (eventLease) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        await syncLock.complete(eventLease.key, eventLease.token);
      } else {
        await syncLock.release(eventLease.key, eventLease.token);
      }
    }
  }
}
