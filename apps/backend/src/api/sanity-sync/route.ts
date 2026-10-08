import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { Logger, IProductModuleService } from "@medusajs/framework/types";
import { sanitySyncProductWorkflow } from "../../workflows/sanity-sync";
import {
  SanitySyncWorkflowInput,
  SanityProductPayload,
  SanityImagePayload,
  SanityRawProductInput,
  SanityRawImageInput,
} from "../../workflows/sanity-sync/types";
import { getSanityApiUrl, shouldBlockStagingPayload } from "./guards";

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

  documentType?: string;
  _type?: string;
  documentIds?: unknown;
  productData?: SanityRawProductInput;
}

interface AuthenticatedSyncRequest extends MedusaRequest<SanitySyncWebhookPayload> {
  _releaseSyncLock?: () => void;
}

type OperationTypes = "update" | "create" | "batch" | "delete";
type DocumentType = "product" | "category";

export type SanityRawWebhookImage = SanityRawImageInput;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

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
    return operation;
  }

  return "create";
};

const getSanityIdCandidates = (sanityId: string): string[] => {
  const cleanId = cleanSanityId(sanityId);
  return [...new Set([sanityId, cleanId])];
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

const extractCategoryReferenceId = (value: unknown): string | undefined => {
  if (!isRecord(value)) return undefined;
  return getString(value._ref) || getString(value._id);
};

interface SanityCategoryDetails {
  id: string;
  handle: string;
  title: string;
}

const getSanityCategoryDetails = async (
  referenceId: string,
  projectId: string,
  dataset: string,
): Promise<SanityCategoryDetails | undefined> => {
  const query =
    '*[_id == $id][0]{"id": _id, "handle": slug.current, "title": title.en}';
  const queryUrl = new URL(
    `https://${projectId}.api.sanity.io/v2021-10-21/data/query/${encodeURIComponent(dataset)}`,
  );

  const headers: Record<string, string> = { Accept: "application/json" };
  const sanityToken = process.env.SANITY_API_TOKEN;
  if (sanityToken) headers.Authorization = `Bearer ${sanityToken}`;

  for (const candidateId of getSanityIdCandidates(referenceId)) {
    const candidateUrl = new URL(queryUrl);
    candidateUrl.searchParams.set("query", query);
    candidateUrl.searchParams.set("$id", JSON.stringify(candidateId));

    const response = await fetch(candidateUrl, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) continue;

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !isRecord(payload.result)) continue;

    const id = getString(payload.result.id);
    const handle = getString(payload.result.handle);
    if (!id || !handle) continue;

    return {
      id: cleanSanityId(id),
      handle,
      title: getString(payload.result.title) || handle,
    };
  }

  return undefined;
};

const extractImageToken = (value: unknown): string | undefined => {
  if (!isRecord(value)) return undefined;
  const directUrl = getString(value.url);
  if (directUrl) return directUrl;

  const asset = isRecord(value.asset) ? value.asset : value;
  return getString(asset._ref) || getString(asset._id) || getString(asset.url);
};

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

const BASE_URL = process.env.BACKEND_URL;
const DEFAULT_FALLBACK =
  process.env.SANITY_IMAGE_FALLBACK_URL || `${BASE_URL}/static/placeholder.png`;
const activeSyncQueues = new Map<string, Promise<void>>();

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
  const authToken = req.headers["x-sanity-sync-token"] as string | undefined;

  const projectId =
    process.env.SANITY_PROJECT_ID ||
    process.env.SANITY_STUDIO_PROJECT_ID ||
    "4vzx52ot";

  const dataset =
    process.env.SANITY_DATASET ||
    process.env.SANITY_STUDIO_DATASET ||
    "development";

  const imgFallbackUrl = DEFAULT_FALLBACK;
  const configuredSyncToken = process.env.SANITY_SYNC_SECRET_TOKEN;
  const isValidToken =
    authToken &&
    (configuredSyncToken
      ? authToken === configuredSyncToken
      : process.env.NODE_ENV !== "production" && authToken === "development");

  if (!isValidToken) {
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
    const rawPayload = req.body;
    const sanityOperationHeader = req.headers["sanity-operation"];
    const sanityDocumentIdHeader = req.headers["sanity-document-id"];
    const sanityOperation = Array.isArray(sanityOperationHeader)
      ? sanityOperationHeader[0]
      : sanityOperationHeader;
    const sanityDocumentId = Array.isArray(sanityDocumentIdHeader)
      ? sanityDocumentIdHeader[0]
      : sanityDocumentIdHeader;


   

    const uncheckedBody = rawPayload as Record<string, any>;

    const incomingId: string =
      uncheckedBody._id || uncheckedBody.productData?._id || "";

    if (incomingId.startsWith("prod_")) {
      logger.info(
        `[Sanity Sync Guard] Safely bypassed automated echo webhook for Medusa-originated product: [${incomingId}].`,
      );

      if (typeof req._releaseSyncLock === "function") {
        req._releaseSyncLock();
      }

      res.status(200).json({
        success: true,
        syncStatus: "ignored",
        message: "Feedback loop bypassed via ID attribution check.",
      });
      return;
    }

    let operation = getWebhookOperation(rawPayload, sanityOperation);
    const documentType =
      rawPayload.documentType ||
      (rawPayload._type === "category" ? "category" : "product");
    const incomingCmsProduct: Partial<SanityRawProductInput> =
      rawPayload.productData || rawPayload;
    const documentId: string =
      sanityDocumentId || incomingCmsProduct?._id || rawPayload?._id || "";

      const cleanId = cleanSanityId(documentId);
    const isDeletion = operation === "delete" || rawPayload.action === "delete";
 
 const guardCheck = await shouldBlockStagingPayload(req, uncheckedBody, documentId, cleanId);
    // Highlight-End

    if (guardCheck.block) {
      if (guardCheck.reason === "AUTHENTICATION_FAILURE") {
        logger.error(`[Sanity Sync Guard] Blocked unauthorized webhook request. Token or API Key mismatch.`);
        res.status(401).json({ success: false, error: "Unauthorized access path." });
        return;
      }

      logger.info(
        `[Sanity Perspective Shield] Staging transaction blocked cleanly via API lookup helper for document ID [${documentId}].`
      );
       if (typeof req._releaseSyncLock === "function") {
        req._releaseSyncLock();
      }

      res.status(200).json({
        success: true,
        syncStatus: "ignored",
        message: "Medusa catalog updates are exclusively locked to Published production perspectives.",
      });
      return;
    }

    const incomingMetadata =
      (incomingCmsProduct?.metadata as Record<string, unknown>) || {};
    const mutationOrigin =
      uncheckedBody._updatedBy ||
      uncheckedBody.productData?._updatedBy ||
      incomingMetadata.is_sync_origin;

    const updatedByField =
      uncheckedBody.productData?.metadata?.updatedBy ||
      incomingMetadata.updatedBy ||
      "sanity-studio";

    if (
      !isDeletion &&
      (mutationOrigin === "medusa" || updatedByField === "medusa-backend")
    ) {
      logger.info(
        `[Sanity Sync Guard] Bypassed automated reverse echo loop for Medusa-driven document: [${cleanId || documentId}].`,
      );

      if (typeof req._releaseSyncLock === "function") {
        req._releaseSyncLock();
      }

      res.status(200).json({
        success: true,
        syncStatus: "ignored",
        message: "Automated reverse mutation loop bypassed safely.",
      });
      return;
    }

    const cmsProduct: Partial<SanityRawProductInput> = cleanId
      ? {
          ...incomingCmsProduct,
          _id: cleanId,
          metadata: {
            ...((incomingCmsProduct.metadata as Record<string, unknown>) || {}),
            sanity_id: cleanId,
            is_sync_origin: "sanity",
            updatedBy: updatedByField,
          },
        }
      : incomingCmsProduct;
    const targetLockKey = cmsProduct._id
      ? `${documentType}-${cmsProduct._id}`
      : null;

    if (targetLockKey && (operation === "create" || operation === "update")) {
      let releaseLockResolver: (() => void) | undefined;
      const currentThreadPromise = new Promise<void>((resolve) => {
        releaseLockResolver = resolve;
      });

      const previousThreadPromise = activeSyncQueues.get(targetLockKey);
      // Overwrite queue head so the next incoming overlapping thread waits for this request to finish
      activeSyncQueues.set(targetLockKey, currentThreadPromise);

      if (previousThreadPromise) {
        logger.info(
          `[Sanity Sync Concurrency Lock] Overlapping parallel thread detected for ${targetLockKey}. Queuing execution path.`,
        );
        await previousThreadPromise;
        operation = "update";
      }
      req._releaseSyncLock = () => {
        releaseLockResolver?.();
        if (activeSyncQueues.get(targetLockKey) === currentThreadPromise) {
          activeSyncQueues.delete(targetLockKey);
        }
      };
    }

    if (operation === "batch") {
      await sanitySyncProductWorkflow(req.scope).run({
        input: rawPayload as SanitySyncWorkflowInput,
      });
      res.status(200).json({
        success: true,
        message: "Batch processing complete",
        operation: operation,
      });
      return;
    }

    if (documentType === "category") {
      const queryEngine = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const productModuleService = req.scope.resolve(
        Modules.PRODUCT,
      ) as IProductModuleService;

      // Extract raw node safely from fields before running string mutations
      const extractedCategorySlug =
        extractCategorySlug(cmsProduct?.slug)?.toLowerCase().trim() || "";
      const categoryTitle =
        cmsProduct?.title?.en ||
        rawPayload.productData?.title?.en ||
        rawPayload.title?.en ||
        "Category";

      if (operation === "delete") {
        const sanityDocId = cleanId;
        if (!sanityDocId) {
          res.status(400).json({
            success: false,
            error: "Category deletion payload is missing a Sanity document ID.",
          });
          return;
        }

        let targetCategory:
          | { id: string; handle: string; products?: { id: string }[] }
          | undefined;
        for (const candidateId of getSanityIdCandidates(sanityDocId)) {
          const { data: categories } = await queryEngine.graph({
            entity: "product_category",
            fields: ["id", "handle", "products.id"],
            filters: {
              metadata: {
                sanity_id: candidateId,
                is_sync_origin: "sanity",
                updatedBy: "sanity-studio",
              },
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
          logger.info(
            `[Sanity Sync] Category [${sanityDocId}] is already absent in Medusa.`,
          );
          res.status(200).json({
            success: true,
            message: "Category already absent from Medusa.",
          });
          return;
        }

        if (targetCategory.products && targetCategory.products.length > 0) {
          logger.warn(
            `[Sanity Sync Guard] Purge blocked: Category [${targetCategory.handle}] contains active mapped products.`,
          );
          res.status(200).json({
            success: false,
            message:
              "Sync execution blocked: Cannot delete a category with assigned products.",
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
            title: { en: "Category Deletion Reference" },
            description: { en: "" },
            categories: [],
            metadata: {
              sanity_id: sanityDocId,
              is_sync_origin: "sanity",
              updatedBy: "sanity-studio",
            },
          },
        };
        logger.info(
          `[Sanity Sync Hook] Dispatching deletion workflow step for Medusa ID: [${targetCategory.id}]`,
        );
        await sanitySyncProductWorkflow(req.scope).run({
          input: deletionInput,
        });

        if (req._releaseSyncLock) req._releaseSyncLock();
        res.status(200).json({
          success: true,
          message: "Category deletion synced successfully.",
          operation,
        });
        return;
      }
      if (operation === "create" || operation === "update") {
        if (extractedCategorySlug === "") {
          if (req._releaseSyncLock) req._releaseSyncLock();
          res.status(400).json({
            success: false,
            error:
              "Validation failure: Target category handle cannot be empty.",
          });
          return;
        }

        const categories = await productModuleService.listProductCategories({
          handle: [extractedCategorySlug],
        });
        const sanityId = cmsProduct?._id || "";
        if (categories.length === 0) {
          logger.info(
            `[Sanity Sync Hook] Spawning standalone Category row for handle: [${extractedCategorySlug}]`,
          );
          await productModuleService.createProductCategories([
            {
              name: categoryTitle,
              handle: extractedCategorySlug,
              is_active: true,
              metadata: {
                sanity_id: sanityId,
                is_sync_origin: "sanity",
                updatedBy: "sanity-studio",
              },
            },
          ]);
        } else {
          logger.info(
            `[Sanity Sync Hook] Updating standalone Category row for handle: [${extractedCategorySlug}]`,
          );
          await productModuleService.updateProductCategories(categories[0].id, {
            name: categoryTitle,
            is_active: true,
            metadata: {
              ...categories[0].metadata,
              sanity_id: sanityId,
              is_sync_origin: "sanity",
              updatedBy: "sanity-studio",
            },
          });
        }

        res.status(200).json({
          success: true,
          message: "Category sync complete",
          operation,
        });
        return;
      }
    }

    if (operation === "delete" && documentType === "product") {
      const sanityDocId =
        rawPayload._id || cmsProduct?._id || sanityDocumentId || "";

      logger.info(
        `[Sanity Sync Hook] Intercepted Delete operation for Sanity Product ID: [${sanityDocId}]`,
      );
      if (!sanityDocId) {
        if (req._releaseSyncLock) req._releaseSyncLock();
        res.status(400).json({
          success: false,
          error:
            "Validation Failure: Deletion payload is missing a valid document reference ID.",
        });
        return;
      }

      const queryEngine = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      let targetProduct: { id: string; handle: string } | undefined;
      for (const candidateId of getSanityIdCandidates(sanityDocId)) {
        const { data: existingProducts } = await queryEngine.graph({
          entity: "product",
          fields: ["id", "handle"],
          filters: {
            metadata: {
              sanity_id: candidateId,
              is_sync_origin: "sanity",
              updatedBy: "sanity-studio",
            },
          } as Record<string, unknown>,
        });
        targetProduct = existingProducts?.[0];
        if (targetProduct) break;
      }

      if (!targetProduct) {
        logger.warn(
          `[Sanity Sync Guard] Deletion skipped: No matching product row found in Neon DB for Sanity ID [${sanityDocId}].`,
        );
        if (req._releaseSyncLock) req._releaseSyncLock();
        res.status(200).json({
          success: true,
          message: "Sync skipped: Record already absent from database.",
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
            updatedBy: "sanity-studio",
          },
        },
      };

      logger.info(
        `[Sanity Sync Hook] Dispatching deletion workflow step for Medusa ID: [${targetProduct.id}]`,
      );
      await sanitySyncProductWorkflow(req.scope).run({ input: deletionInput });
      if (req._releaseSyncLock) req._releaseSyncLock();
      res.status(200).json({
        success: true,
        message: "Product deletion synced successfully.",
        operation,
      });
      return;
    }

    if (!cmsProduct || !cmsProduct._id) {
      if (req._releaseSyncLock) req._releaseSyncLock();
      res
        .status(400)
        .json({ error: "Invalid single product payload metadata received." });
      return;
    }

    const queryEngine = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const productModuleService = req.scope.resolve(
      Modules.PRODUCT,
    ) as IProductModuleService;
    // Resolve category references to active Medusa category IDs before product upsert.
    const categoryIds: string[] = [];
    if (Array.isArray(cmsProduct.categories)) {
      for (const category of cmsProduct.categories) {
        const referenceId = extractCategoryReferenceId(category);
        let matchedCategory: { id: string; handle: string } | undefined;

        if (referenceId) {
          for (const candidateId of getSanityIdCandidates(referenceId)) {
            const { data: matchedCategories } = await queryEngine.graph({
              entity: "product_category",
              fields: ["id", "handle"],
              filters: {
                metadata: {
                  sanity_id: candidateId,
                  updatedBy: "sanity-studio",
                  is_sync_origin: "sanity",
                },
              } as Record<string, unknown>,
            });
            matchedCategory = matchedCategories?.[0];
            if (matchedCategory) break;
          }
        }

        const targetSlug = extractCategorySlug(category)?.toLowerCase().trim();
        if (!matchedCategory && targetSlug) {
          const { data: matchedCategories } = await queryEngine.graph({
            entity: "product_category",
            fields: ["id", "handle"],
            filters: { handle: [targetSlug] },
          });
          matchedCategory = matchedCategories?.[0];
        }

        if (!matchedCategory && referenceId) {
          try {
            const sanityCategory = await getSanityCategoryDetails(
              referenceId,
              projectId,
              dataset,
            );
            if (sanityCategory) {
              const { data: matchedCategories } = await queryEngine.graph({
                entity: "product_category",
                fields: ["id", "handle"],
                filters: {
                  handle: [sanityCategory.handle.toLowerCase().trim()],
                },
              });

              const existingCategory = matchedCategories?.[0];
              if (existingCategory) {
                await productModuleService.updateProductCategories(
                  existingCategory.id,
                  {
                    name: sanityCategory.title,
                    is_active: true,
                    metadata: {
                      sanity_id: sanityCategory.id,
                      is_sync_origin: "sanity",
                      updatedBy: "sanity-studio",
                    },
                  },
                );
                matchedCategory = existingCategory;
              } else {
                const createdCategories =
                  await productModuleService.createProductCategories([
                    {
                      name: sanityCategory.title,
                      handle: sanityCategory.handle.toLowerCase().trim(),
                      is_active: true,
                      metadata: {
                        sanity_id: sanityCategory.id,
                        is_sync_origin: "sanity",
                        updatedBy: "sanity-studio",
                      },
                    },
                  ]);
                const createdCategory = createdCategories[0];
                if (createdCategory) {
                  matchedCategory = {
                    id: createdCategory.id,
                    handle: createdCategory.handle,
                  };
                  logger.info(
                    `[Sanity Sync] Created dependency category [${sanityCategory.id}] as Medusa category [${createdCategory.id}].`,
                  );
                }
              }
            }
          } catch (error: unknown) {
            logger.warn(
              `[Sanity Sync Guard] Could not resolve category reference [${referenceId}] through Sanity: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        if (matchedCategory) {
          categoryIds.push(matchedCategory.id);
        } else {
          logger.warn(
            `[Sanity Sync Guard] Category reference [${referenceId || targetSlug || "<empty>"}] did not resolve to an existing Medusa category.`,
          );
        }
      }
    }

    const dzdPrice = cmsProduct.pricing?.dzd ?? cmsProduct.basePriceDzd;
    const eurPrice = cmsProduct.pricing?.eur ?? cmsProduct.basePriceEur;
    const usdPrice = cmsProduct.pricing?.usd ?? cmsProduct.basePriceUsd;
    const stockCount = cmsProduct.stockCount ?? 0;

    const normalizedSlug =
      extractCategorySlug(cmsProduct.slug)?.toLowerCase().trim() || "";
    const missingPriceFields = [
      isFiniteNumber(dzdPrice) ? undefined : "pricing.dzd (or basePriceDzd)",
      isFiniteNumber(eurPrice) ? undefined : "pricing.eur (or basePriceEur)",
      isFiniteNumber(usdPrice) ? undefined : "pricing.usd (or basePriceUsd)",
    ].filter((field): field is string => field !== undefined);
    if (
      missingPriceFields.length > 0 ||
      !isFiniteNumber(dzdPrice) ||
      dzdPrice < 0 ||
      !isFiniteNumber(eurPrice) ||
      eurPrice < 0 ||
      !isFiniteNumber(usdPrice) ||
      usdPrice < 0 ||
      stockCount < 0 ||
      normalizedSlug === ""
    ) {
      logger.warn(
        `[Sanity Sync Hook] Fault Ingestion blocked: Malformed payload attributes detected.`,
      );
      if (req._releaseSyncLock) req._releaseSyncLock();

      res.status(400).json({
        success: false,
        error: "Invalid product payload from Sanity.",
        details: [
          ...(missingPriceFields.length > 0
            ? [`Missing numeric prices: ${missingPriceFields.join(", ")}.`]
            : []),
          ...([dzdPrice, eurPrice, usdPrice].some(
            (price) => isFiniteNumber(price) && price < 0,
          )
            ? ["Prices cannot be negative."]
            : []),
          ...(stockCount < 0 ? ["stockCount cannot be negative."] : []),
          ...(normalizedSlug === "" ? ["A product slug is required."] : []),
        ].join(" "),
      });

      return;
    }

    const resolvedCategoryIds = [...new Set(categoryIds)];
    if (resolvedCategoryIds.length === 0) {
      res.status(400).json({
        success: false,
        error:
          "Product cannot be published until it references an existing Medusa category. Create and sync a category in Sanity, then assign it to the product.",
      });
      return;
    }

    logger.info(
      `[Sanity Sync Hook] Ingesting operation: [${operation}] for Content Type [${documentType}] ID [${cmsProduct._id}]`,
    );

    const mappedImages: SanityImagePayload[] = (cmsProduct.images ?? []).map(
      (image) => ({
        url: getSafeImageUrl(
          extractImageToken(image),
          projectId,
          dataset,
          imgFallbackUrl,
        ),
        altText: JSON.stringify({
          en: image.alt_en || image.alt || "Product catalog element",
          fr: image.alt_fr || "",
          ar: image.alt_ar || "",
        }),
      }),
    );

    const standardizedProductData: SanityProductPayload = {
      _id: cmsProduct._id,
      title: cmsProduct.title || { en: "Untitled Product" },
      description: cmsProduct.description || { en: "" },
      slug: normalizedSlug || `prod-${cmsProduct._id}`,

      basePriceDzd: dzdPrice,
      basePriceEur: eurPrice,
      basePriceUsd: usdPrice,
      metadata: {
        ...((cmsProduct.metadata as Record<string, unknown>) || {}),
        sanity_id: cmsProduct._id,
        is_sync_origin: "sanity",
        updatedBy: "sanity-studio",
      },

      stockCount: cmsProduct.stockCount ?? 0,
      weightGrams: cmsProduct.weightGrams,
      lengthMm: cmsProduct.lengthMm,
      widthMm: cmsProduct.widthMm,
      heightMm: cmsProduct.heightMm,
      originCountry: cmsProduct.originCountry,
      categories: [],
      images: mappedImages,
      manage_inventory: cmsProduct.manage_inventory ?? true,
      allow_backorder: cmsProduct.allow_backorder ?? false,
    };

    const standardizedInput: SanitySyncWorkflowInput = {
      operation: operation as OperationTypes,
      documentType: documentType as DocumentType,
      productData: standardizedProductData,
      categoryIds: resolvedCategoryIds,
    };
    const workflowResponse = await sanitySyncProductWorkflow(req.scope).run({
      input: standardizedInput,
    });

    const medusaOperation = workflowResponse.result.operation;
    logger.info(
      `[Sanity Sync Hook] Completed Sanity [${operation}] for [${cmsProduct._id}]; Medusa outcome: [${medusaOperation}].`,
    );

    res.status(200).json({
      success: workflowResponse.result.success,
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
    if (req._releaseSyncLock) {
      req._releaseSyncLock();
    }
  }
}
