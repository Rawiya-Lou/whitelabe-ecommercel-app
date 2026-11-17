import { createHash } from "node:crypto";
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { Logger } from "@medusajs/framework/types";

import { sanitySyncProductWorkflow } from "../../../workflows/sanity-sync/index";
import { sanitySyncCategoryWorkflow } from "../../../workflows/sanity-sync/category-workflow";
import {syncCategoryToSanityWorkflow } from "../../../workflows/sanity-sync/category-forward-workflow";
import { assertCategoryCanBeDeleted } from "../../../utils/product-category-delete-guard";

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
} from "../../../workflows/sanity-sync/types";

import { syncLock } from "../../../utils/sync-lock";
import { getSanityConfig } from "../../../modules/sanity-sync/config";

import {
  verifyWebhookSignature,
  createRequestFingerprint,
  getSafeImageUrl,
  extractImageToken,
  isRecord,
  getString,
  sanitizeText,
  sanitizeHex,
  sanitizeHandle,
  cleanSanityId,
  getSanityIdCandidates,
  extractCategorySlug,
  getLocalizedText,
  getWebhookOperation,
  OperationTypes,
  DocumentType,
} from "./utils/index";

export interface SanityRawWebhookReference {
  _key?: string;
  _ref?: string;
  _id?: string;
  _type: "reference";
}

interface SanitySyncWebhookPayload extends Omit<
  Partial<SanityRawProductInput>,
  "variants" | "categories" | "images"
> {
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
  categories?: unknown;
  images?: unknown;
  variants?: unknown;
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
export const AUTHENTICATE = false;

export async function POST(
  req: AuthenticatedSyncRequest,
  res: MedusaResponse,
): Promise<void> {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const queryEngine = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  let eventLease: { key: string; token: string } | undefined;
  const syncLeases: Array<{ key: string; token: string }> = [];

  const { projectId = "", dataset = "" } = getSanityConfig();
  if (!projectId || !dataset) {
    logger.error("[Sanity Sync Hook] Sanity project ID or dataset is missing.");
    res
      .status(500)
      .json({ error: "Sanity project ID and dataset must be configured." });
    return;
  }

  // 1. AUTHENTICATION & FINGERPRINTING
  const rawBodyString =
    typeof req.rawBody === "string"
      ? req.rawBody
      : req.rawBody?.toString("utf8");
  const requestFingerprint = createRequestFingerprint(rawBodyString);

  const auth = verifyWebhookSignature({
    suppliedToken: Array.isArray(req.headers["x-sanity-sync-token"])
      ? req.headers["x-sanity-sync-token"][0]
      : req.headers["x-sanity-sync-token"],
    tokenSecret:
      process.env.SANITY_SYNC_SECRET_TOKEN || process.env.SANITY_WEBHOOK_SECRET,
    signature: Array.isArray(req.headers["sanity-webhook-signature"])
      ? req.headers["sanity-webhook-signature"][0]
      : req.headers["sanity-webhook-signature"],
    webhookSecret:
      process.env.SANITY_WEBHOOK_SECRET || process.env.SANITY_SYNC_SECRET_TOKEN,
    rawBodyString,
  });

  if (!auth.isValid) {
    logger.warn(`[Sanity Sync Hook] Unauthorized Attempt: ${auth.reason}`);
    res.status(401).send("Unauthorized");
    return;
  }

  try {
    const requestBody: unknown = req.body;
    if (!isRecord(requestBody)) {
      res.status(400).json({ error: "Webhook payload must be a JSON object." });
      return;
    }
    const rawPayload = requestBody as SanitySyncWebhookPayload;

    const sanityOperationHeader = getString(
      Array.isArray(req.headers["sanity-operation"])
        ? req.headers["sanity-operation"][0]
        : req.headers["sanity-operation"],
    );
    const sanityDocumentIdHeader = getString(
      Array.isArray(req.headers["sanity-document-id"])
        ? req.headers["sanity-document-id"][0]
        : req.headers["sanity-document-id"],
    );

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

    const incomingCmsProduct = (
      nestedProduct ? { ...rawPayload, ...nestedProduct } : rawPayload
    ) as Partial<SanityRawProductInput> & Record<string, any>;

    const documentId =
      sanityDocumentIdHeader ||
      incomingCmsProduct?._id ||
      rawPayload?._id ||
      "";
    const cleanId = cleanSanityId(documentId);

    let resolvedRequestContextOperation: OperationTypes = getWebhookOperation(
      rawPayload,
      sanityOperationHeader,
    );

    if (sanityOperationHeader === "delete" || rawPayload.action === "delete") {
      resolvedRequestContextOperation = "delete";
    }

    const isDeletion =
      resolvedRequestContextOperation === "delete" ||
      rawPayload.action === "delete" ||
      rawPayload._action === "delete";

    const rawDocType = rawPayload.documentType;
    const documentType: DocumentType =
      rawDocType === "category" || rawDocType === "product"
        ? rawDocType
        : incomingCmsProduct._type === "category"
          ? "category"
          : "product";

    const syncOrigin =
      getString(uncheckedBody.syncOrigin) ||
      getString(uncheckedBody.is_sync_origin);

    logger.info(
      `[Sanity Sync Hook] Incoming document state: ${JSON.stringify({
        documentId: cleanId,
        documentType,
        operation: resolvedRequestContextOperation,
        revision: getString(rawPayload._rev) || null,
        syncOrigin: syncOrigin || null,
        requestFingerprint,
      })}`,
    );

    // ECHO DETECTION
    const echoCorrelationId = cleanId
      ? await syncLock.consume(`sanity-echo:${cleanId}`)
      : undefined;
    if (echoCorrelationId) {
      logger.info(
        `[Sanity Sync Hook] Ignoring outbound Medusa echo for ${cleanId}; correlationId=${echoCorrelationId}.`,
      );
      res.status(200).json({
        success: true,
        syncStatus: "ignored",
        message: "Acknowledged Medusa-originated Sanity mutation.",
      });
      return;
    }

    let operation: OperationTypes = resolvedRequestContextOperation;

    // PERSPECTIVE & DRAFT DETECTION
    const urlPerspective = req.query?.perspective as string | undefined;
    const rawPerspectives = rawPayload._perspectives;
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
      logger.info(
        `[Sanity Sync] Deferring execution for unpublished draft: [${incomingId}].`,
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

    // DEDUPLICATION LOCK
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

    // CONCURRENCY LOCK
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
        for (const category of categories) {
          const categoryId = cleanSanityId(getString(category._id) || "");
          const slug = sanitizeHandle(extractCategorySlug(category.slug) || "");
          if (!categoryId || !slug) {
            res.status(400).json({
              error: "Every batch category requires an _id and slug.",
            });
            return;
          }

          const localizedTitle = isRecord(category.title) ? category.title : {};
          const name = sanitizeText(
            getString(localizedTitle.en) ||
              getString(category.title) ||
              "Category",
            150,
          );
          const localizedDescription = isRecord(category.description)
            ? category.description
            : {};
          const description = sanitizeText(
            getString(localizedDescription.en) ||
              getString(category.description) ||
              "",
            2000,
          );

          await sanitySyncCategoryWorkflow(req.scope).run({
            input: {
              sanityId: categoryId,
              name,
              handle: slug,
              description,
              metadata: {
                sanity_id: categoryId,
                is_sync_origin: "sanity",
                translations: {
                  en: { title: name, description },
                  fr: {
                    title: sanitizeText(getString(localizedTitle.fr), 150),
                    description: sanitizeText(
                      getString(localizedDescription.fr),
                      2000,
                    ),
                  },
                  ar: {
                    title: sanitizeText(getString(localizedTitle.ar), 150),
                    description: sanitizeText(
                      getString(localizedDescription.ar),
                      2000,
                    ),
                  },
                },
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

      // Batch Products
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
          res
            .status(400)
            .json({ error: "Every batch product requires an _id and slug." });
          return;
        }

        const productCategories: SanityCategoryPayload[] = [];
        const rawBatchCategories = Array.isArray(product.categories)
          ? product.categories
          : [];

        for (const rawCategory of rawBatchCategories) {
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
                filters: { metadata: { sanity_id: candidate } } as Record<
                  string,
                  unknown
                >,
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
            res
              .status(400)
              .json({
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
          res
            .status(400)
            .json({
              error: `Batch product ${productId} must reference a Medusa category.`,
            });
          return;
        }

        const titleTranslations = {
          en: sanitizeText(getLocalizedText(product.title, "en"), 255),
          fr: sanitizeText(getLocalizedText(product.title, "fr"), 255),
          ar: sanitizeText(getLocalizedText(product.title, "ar"), 255),
        };
        const descriptionTranslations = {
          en: sanitizeText(getLocalizedText(product.description, "en"), 5000),
          fr: sanitizeText(getLocalizedText(product.description, "fr"), 5000),
          ar: sanitizeText(getLocalizedText(product.description, "ar"), 5000),
        };
        const materialTranslations = {
          en: sanitizeText(getLocalizedText(product.material, "en"), 200),
          fr: sanitizeText(getLocalizedText(product.material, "fr"), 200),
          ar: sanitizeText(getLocalizedText(product.material, "ar"), 200),
        };

        const batchImages: SanityImagePayload[] = (
          Array.isArray(product.images) ? product.images : []
        )
          .slice(0, 20)
          .flatMap((image: any, index: number) => {
            const token = extractImageToken(image);
            if (!token) return [];
            const englishAlt =
              getLocalizedText(image.alt, "en", 150) || "Product image";
            return [
              {
                _type: "image",
                _key:
                  sanitizeText(image._key, 50) || `batch_${productId}_${index}`,
                id: (image.id as string) || `batch_${productId}_${index}`,
                url: getSafeImageUrl(token, projectId, dataset),
                alt: englishAlt,
                alt_en: englishAlt,
                alt_fr: sanitizeText(getLocalizedText(image.alt, "fr"), 150),
                alt_ar: sanitizeText(getLocalizedText(image.alt, "ar"), 150),
              },
            ];
          });

        const standardizedProduct: SanityProductPayload = {
          _id: productId,
          title: titleTranslations.en || "Product",
          subtitle: titleTranslations.fr || "",
          description: descriptionTranslations.en || "",
          material: materialTranslations.en || "",
          slug: productSlug,
          tags: Array.isArray(product.tags)
            ? (product.tags
                .map((t: any) => sanitizeText(t?.value || t, 50))
                .filter(Boolean) as any)
            : [],
          highlights: Array.isArray(product.highlights)
            ? (product.highlights
                .slice(0, 15)
                .map((h) => sanitizeText(h, 300)) as any)
            : [],
          seo: (product.seo as SanitySEOPayload) || {},
          productType: sanitizeText(product.productType, 100),
          images: batchImages,
          categories: productCategories,
          variants: (Array.isArray(product.variants)
            ? product.variants
            : []) as any,
          manage_inventory: product.manage_inventory ?? true,
          allow_backorder: product.allow_backorder ?? false,
          metadata: {
            sanity_id: productId,
            is_sync_origin: "sanity",
            translations: {
              en: titleTranslations,
              fr: descriptionTranslations,
              ar: materialTranslations,
            },
          },
        };

        normalizedBatch.push({
          operation: "create",
          documentType: "product",
          productData: standardizedProduct,
          categoryIds: productCategories.flatMap((c) =>
            typeof c.id === "string" ? [c.id] : [],
          ),
        });
      }

      for (const batchInput of normalizedBatch) {
        await sanitySyncProductWorkflow(req.scope).run({
          input: batchInput,
        });
      }

      res.status(200).json({
        success: true,
        operation: "batch",
        documentType,
        processed: normalizedBatch.length,
      });
      return;
    }


    if (documentType === "category") {
      const extractedCategorySlug = sanitizeHandle(
        extractCategorySlug(incomingCmsProduct?.slug) || "",
      );

      const rawCategoryTitlePayload =
        incomingCmsProduct?.title ||
        rawPayload.productData?.title ||
        rawPayload.title;
      let categoryTitle = "Category";
      if (
        typeof rawCategoryTitlePayload === "string" &&
        rawCategoryTitlePayload.trim() !== ""
      ) {
        categoryTitle = sanitizeText(rawCategoryTitlePayload, 150);
      } else if (isRecord(rawCategoryTitlePayload)) {
        categoryTitle = sanitizeText(
          (rawCategoryTitlePayload as SanityLocalizedString).en || "Category",
          150,
        );
      }

      const rawCategoryDesc =
        incomingCmsProduct?.description ||
        rawPayload.productData?.description ||
        rawPayload.description;
      let categoryDescription = "";
      if (typeof rawCategoryDesc === "string") {
        categoryDescription = sanitizeText(rawCategoryDesc, 2000);
      } else if (isRecord(rawCategoryDesc)) {
        categoryDescription = sanitizeText(
          rawCategoryDesc.en || rawCategoryDesc.fr || rawCategoryDesc.ar || "",
          2000,
        );
      }

      if (operation === "delete" || isDeletion) {
        const sanityDocId = cleanId;
        let targetCategory:
          | { id: string; name: string; handle: string; products?: { id: string }[] }
          | undefined;

        for (const candidateId of getSanityIdCandidates(sanityDocId)) {
          const { data: categories } = await queryEngine.graph({
            entity: "product_category",
            fields: ["id", "name", "handle", "products.id"],
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
            fields: ["id", "name", "handle", "products.id"],
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

        try {
          assertCategoryCanBeDeleted(targetCategory);
        } catch (guardError: any) {
          logger.warn(
            `[Category Delete Guard] Blocked deletion of category [${targetCategory.name || targetCategory.id}]: still contains assigned products. Resurrecting in Sanity...`,
          );
          try {
            await syncCategoryToSanityWorkflow(req.scope).run({
              input: { categoryId: targetCategory.id },
            });
          } catch (syncErr) {
            logger.error(
              `[Category Delete Guard] Failed to restore category in Sanity: ${syncErr}`,
            );
          }

          res.status(400).json({
            success: false,
            error: "Cannot delete a category with assigned products.",
            details: guardError.message,
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

        const titleTranslations = isRecord(rawCategoryTitlePayload)
          ? {
              en:
                sanitizeText(getString(rawCategoryTitlePayload.en), 150) ||
                categoryTitle,
              fr: sanitizeText(getString(rawCategoryTitlePayload.fr), 150),
              ar: sanitizeText(getString(rawCategoryTitlePayload.ar), 150),
            }
          : { en: categoryTitle, fr: "", ar: "" };

        const descriptionTranslations = isRecord(rawCategoryDesc)
          ? {
              en:
                sanitizeText(getString(rawCategoryDesc.en), 2000) ||
                categoryDescription,
              fr: sanitizeText(getString(rawCategoryDesc.fr), 2000),
              ar: sanitizeText(getString(rawCategoryDesc.ar), 2000),
            }
          : { en: categoryDescription, fr: "", ar: "" };

        await sanitySyncCategoryWorkflow(req.scope).run({
          input: {
            sanityId: cleanId,
            name: categoryTitle,
            handle: extractedCategorySlug,
            description: categoryDescription,
            metadata: {
              sanity_id: cleanId,
              is_sync_origin: "sanity",
              translations: {
                en: titleTranslations,
                fr: descriptionTranslations,
                ar: descriptionTranslations,
              },
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

      await sanitySyncProductWorkflow(req.scope).run({
        input: deletionInput,
      });

      res.status(200).json({
        success: true,
        message: "Product deletion synced successfully.",
        operation: "delete",
      });
      return;
    }

   
    const rawCategories = Array.isArray(incomingCmsProduct.categories)
      ? incomingCmsProduct.categories
      : Array.isArray(rawPayload.categories)
        ? rawPayload.categories
        : [];
    const categoryPayload: SanityCategoryPayload[] = [];

    for (const rawCategory of rawCategories) {
      if (!rawCategory) continue;

      const rawRef = isRecord(rawCategory)
        ? rawCategory._ref || rawCategory._id
        : rawCategory;
      const rawCategorySlug = isRecord(rawCategory)
        ? extractCategorySlug(rawCategory.slug)
        : undefined;

      let matchedCategory:
        { id: string; handle: string; name?: string } | undefined;

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

      if (!matchedCategory && rawCategorySlug) {
        const { data: matchedBySlug } = await queryEngine.graph({
          entity: "product_category",
          fields: ["id", "handle", "name"],
          filters: { handle: [sanitizeHandle(rawCategorySlug)] },
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

    if (categoryPayload.length === 0) {
      res.status(400).json({
        success: false,
        error:
          "Product references must resolve to an existing Medusa category.",
      });
      return;
    }

    const rawSlug =
      extractCategorySlug(incomingCmsProduct.slug) || `prod-${cleanId}`;
    const normalizedSlug = sanitizeHandle(rawSlug);

    const resolvedCategoryPayloads = categoryPayload.filter(
      (payload, index, self) =>
        self.findIndex((p) => p.id === payload.id) === index,
    );

    // Mapped Images
    const rawImages: SanityRawImageInput[] = Array.isArray(
      incomingCmsProduct.images,
    )
      ? (incomingCmsProduct.images as SanityRawImageInput[])
      : Array.isArray(rawPayload.productData?.images)
        ? (rawPayload.productData.images as SanityRawImageInput[])
        : Array.isArray(rawPayload.images)
          ? (rawPayload.images as SanityRawImageInput[])
          : [];

    const mappedImages: SanityImagePayload[] = [];
    rawImages
      .slice(0, 20)
      .forEach((image: SanityRawImageInput, index: number) => {
        if (!image) return;
        const resolvedToken = extractImageToken(image);

        if (resolvedToken && typeof resolvedToken === "string") {
          const cleanCdnUrl = getSafeImageUrl(
            resolvedToken.trim(),
            projectId,
            dataset,
          );
          const originalRef = image.asset?._ref || (image._ref as string) || "";
          const resolvedEnText =
            getLocalizedText(image.alt, "en", 150) ||
            sanitizeText(getString(image.alt_en), 150) ||
            "Product catalog image";
          const localizedAlt = isRecord(image.alt) ? image.alt : {};
          const computedKey =
            sanitizeText(image._key, 50) || `img_${index}_${Date.now()}`;

          mappedImages.push({
            _type: "image",
            _key: computedKey,
            id: (image.id as string) || computedKey,
            url: cleanCdnUrl,
            alt: resolvedEnText,
            alt_en: resolvedEnText,
            alt_fr: sanitizeText(
              getString(localizedAlt.fr) || image.alt_fr,
              150,
            ),
            alt_ar: sanitizeText(
              getString(localizedAlt.ar) || image.alt_ar,
              150,
            ),
            asset: originalRef
              ? { _type: "reference", _ref: originalRef }
              : undefined,
          });
        }
      });

    // Mapped Variants
    const rawVariants = Array.isArray(incomingCmsProduct.variants)
      ? incomingCmsProduct.variants
      : [];

    const mappedVariants = rawVariants
      .slice(0, 50)
      .map((variant: any, variantIndex: number) => {
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
              url: getSafeImageUrl(swatchToken, projectId, dataset),
              sanity_asset_id: swatchAssetId || swatchToken,
              alt: {
                en: getLocalizedText(swatch?.alt, "en", 150),
                fr: getLocalizedText(swatch?.alt, "fr", 150),
                ar: getLocalizedText(swatch?.alt, "ar", 150),
              },
            }
          : undefined;

        const variantImages = (
          Array.isArray(variant.images) ? variant.images : []
        )
          .slice(0, 10)
          .flatMap((image: any, imageIndex: number) => {
            const token = extractImageToken(image);
            if (!token) return [];
            const assetRef =
              image.asset?._ref ||
              (typeof image._ref === "string" ? image._ref : "");
            const alt = isRecord(image.alt) ? image.alt : {};
            const englishAlt =
              getLocalizedText(image.alt, "en", 150) ||
              sanitizeText(getString(image.alt_en), 150) ||
              "Variant image";

            return [
              {
                _type: "image" as const,
                _key: image._key || `var_${variantIndex}_img_${imageIndex}`,
                id: image._key || `var_${variantIndex}_img_${imageIndex}`,
                url: getSafeImageUrl(token, projectId, dataset),
                alt: englishAlt,
                alt_en: englishAlt,
                alt_fr: sanitizeText(getString(alt.fr) || image.alt_fr, 150),
                alt_ar: sanitizeText(getString(alt.ar) || image.alt_ar, 150),
                asset: assetRef
                  ? { _type: "reference", _ref: assetRef }
                  : undefined,
              },
            ];
          });

        return {
          title: sanitizeText(variant.title, 150),
          sku: sanitizeText(variant.sku, 100),
          variantId:
            variant.medusa_variant_id || variant.variantId || variant._key,
          images: variantImages,
          metadata: {
            sanity_variant_content: {
              description: {
                en: getLocalizedText(variant.description, "en", 2000),
                fr: getLocalizedText(variant.description, "fr", 2000),
                ar: getLocalizedText(variant.description, "ar", 2000),
              },
              details: {
                en: getLocalizedText(variant.details, "en", 2000),
                fr: getLocalizedText(variant.details, "fr", 2000),
                ar: getLocalizedText(variant.details, "ar", 2000),
              },
              badge: {
                en: getLocalizedText(variant.badge, "en", 100),
                fr: getLocalizedText(variant.badge, "fr", 100),
                ar: getLocalizedText(variant.badge, "ar", 100),
              },
              colorHex: sanitizeHex(variant.colorHex),
              swatchImage: swatchImage ?? null,
            },
          },
        };
      });

    const mappedAllImages = [
      ...new Map(
        [
          ...mappedImages,
          ...mappedVariants.flatMap((variant: any) => variant.images ?? []),
        ].map((image) => [image.url, image]),
      ).values(),
    ];

    // Canonical Translations & Metadata
    const titleEn = sanitizeText(
      getLocalizedText(incomingCmsProduct.title, "en"),
      255,
    );
    const titleFr = sanitizeText(
      getLocalizedText(incomingCmsProduct.title, "fr"),
      255,
    );
    const titleAr = sanitizeText(
      getLocalizedText(incomingCmsProduct.title, "ar"),
      255,
    );

    const descEn = sanitizeText(
      getLocalizedText(incomingCmsProduct.description, "en"),
      5000,
    );
    const descFr = sanitizeText(
      getLocalizedText(incomingCmsProduct.description, "fr"),
      5000,
    );
    const descAr = sanitizeText(
      getLocalizedText(incomingCmsProduct.description, "ar"),
      5000,
    );

    const materialEn = sanitizeText(
      getLocalizedText(incomingCmsProduct.material, "en"),
      200,
    );
    const materialFr = sanitizeText(
      getLocalizedText(incomingCmsProduct.material, "fr"),
      200,
    );
    const materialAr = sanitizeText(
      getLocalizedText(incomingCmsProduct.material, "ar"),
      200,
    );

    const rawHighlights = Array.isArray(incomingCmsProduct.highlights)
      ? incomingCmsProduct.highlights
          .slice(0, 15)
          .map((h: unknown) => sanitizeText(h, 300))
      : [];

    const stringTags: string[] = Array.isArray(incomingCmsProduct.tags)
      ? incomingCmsProduct.tags
          .slice(0, 30)
          .map((t: any) =>
            sanitizeText(typeof t === "string" ? t : t?.value, 50),
          )
          .filter(Boolean)
      : [];

    const rawSeo: SanitySEOPayload = isRecord(incomingCmsProduct.seo)
      ? (incomingCmsProduct.seo as SanitySEOPayload)
      : {};

    const keywords: string[] = Array.isArray(rawSeo.keywords)
      ? rawSeo.keywords
          .slice(0, 20)
          .map((k: unknown) => sanitizeText(k, 50))
          .filter(Boolean)
      : [];

    const rawOg = isRecord(rawSeo.openGraphImage)
      ? (rawSeo.openGraphImage as SanityOpenGraphImage)
      : undefined;

    let ogUrl = "";
    let ogAssetId = "";
    if (rawOg) {
      ogAssetId = rawOg.assetId || rawOg.asset?._ref || "";
      const token = rawOg.url || ogAssetId;
      ogUrl = token ? getSafeImageUrl(token, projectId, dataset) : "";
    }

    const resolveLocalizedSeo = (
      val: unknown,
      maxLength: number,
    ): { en?: string; fr?: string; ar?: string } => {
      if (isRecord(val)) {
        return {
          en: sanitizeText(val.en, maxLength) || undefined,
          fr: sanitizeText(val.fr, maxLength) || undefined,
          ar: sanitizeText(val.ar, maxLength) || undefined,
        };
      }
      const str = sanitizeText(val, maxLength);
      return str ? { en: str } : {};
    };

    const seoPayload: SanitySEOPayload = {
      metaTitle: resolveLocalizedSeo(rawSeo.metaTitle, 150),
      metaDescription: resolveLocalizedSeo(rawSeo.metaDescription, 300),
      keywords,
      openGraphImage: {
        url: ogUrl,
        assetId: ogAssetId,
        ...(ogAssetId
          ? { asset: { _type: "reference", _ref: ogAssetId } }
          : {}),
      },
    };

    const standardizedProductData: SanityProductPayload = {
      _id: cleanId,
      title: titleEn || "Product",
      material: materialEn,
      subtitle: titleFr,
      description: descEn,
      slug: normalizedSlug,
      tags: stringTags as any,
      highlights: rawHighlights as any,
      seo: seoPayload,
      productType: sanitizeText(incomingCmsProduct.productType, 100),
      metadata: {
        sanity_id: cleanId,
        is_sync_origin: "sanity",
        productType: sanitizeText(incomingCmsProduct.productType, 100) || null,
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
      },
      weightGrams:
        typeof incomingCmsProduct.weightGrams === "number"
          ? incomingCmsProduct.weightGrams
          : undefined,
      lengthMm:
        typeof incomingCmsProduct.lengthMm === "number"
          ? incomingCmsProduct.lengthMm
          : undefined,
      widthMm:
        typeof incomingCmsProduct.widthMm === "number"
          ? incomingCmsProduct.widthMm
          : undefined,
      heightMm:
        typeof incomingCmsProduct.heightMm === "number"
          ? incomingCmsProduct.heightMm
          : undefined,
      originCountry:
        sanitizeText(incomingCmsProduct.originCountry, 2).toLowerCase() ||
        undefined,
      categories: resolvedCategoryPayloads,
      images: mappedAllImages,
       variantOptions: Array.isArray(incomingCmsProduct.variantOptions)
        ? incomingCmsProduct.variantOptions
        : [],
      variants: mappedVariants as any,
        syncFieldsPresent: {
        tags:
          Array.isArray(incomingCmsProduct.tags) ||
          Array.isArray(rawPayload.tags),
        images:
          Array.isArray(incomingCmsProduct.images) ||
          Array.isArray(rawPayload.productData?.images) ||
          Array.isArray(rawPayload.images),
        variants:
          Array.isArray(incomingCmsProduct.variants) ||
          Array.isArray(incomingCmsProduct.variantOptions),
      },
      manage_inventory: Boolean(incomingCmsProduct.manage_inventory ?? true),
      allow_backorder: Boolean(incomingCmsProduct.allow_backorder ?? false),
    };

    let targetMedusaProductId: string | undefined;

    if (cleanId.startsWith("prod_")) {
      const { data: byId } = await queryEngine.graph({
        entity: "product",
        fields: ["id"],
        filters: { id: cleanId },
      });
      targetMedusaProductId = byId?.[0]?.id;
    }

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

    if (targetMedusaProductId && operation === "create") {
      operation = "update";
    }

    const resolvedCategoryIds: string[] = resolvedCategoryPayloads.flatMap(
      (c) => (typeof c.id === "string" ? [c.id] : []),
    );

    const standardizedInput: SanitySyncWorkflowInput = {
      operation: operation as OperationTypes,
      documentType: documentType as DocumentType,
      productData: standardizedProductData,
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
      input: standardizedInput as any,
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
