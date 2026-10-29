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
  SanityCategoryPayload,
  SanityLocalizedString,
  SanitySEOPayload,
  SanityOpenGraphImage,
} from "../../workflows/sanity-sync/types";

import { syncLock } from "../../utils/sync-lock";

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
  updatedBy?: string;
  _perspectives?: string | string[];
  documentType?: string;
  _type?: string;
  documentIds?: unknown;
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
  _releaseSyncLock?: () => void;
}

type OperationTypes = "update" | "create" | "batch" | "delete";
type DocumentType = "product" | "category";

export type SanityRawWebhookImage = SanityRawImageInput;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

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

const extractCategoryReferenceId = (value: unknown): string | undefined => {
  if (!isRecord(value)) return undefined;
  return getString(value._ref) || getString(value._id);
};

const sanitizeHandle = (slug: string): string =>
  slug
    .toLowerCase()
    .trim()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

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
    '*[_id == $id][0]{"id": _id, "handle": slug.current, "title": coalesce(title.en, title)}';
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

    let parsedTitle = payload.result.title;
    if (typeof parsedTitle === "object" && parsedTitle !== null) {
      parsedTitle = (parsedTitle as any).en || "Category";
    }

    return {
      id: cleanSanityId(id),
      handle,
      title:
        typeof parsedTitle === "string"
          ? parsedTitle.trim()
          : String(parsedTitle || handle),
    };
  }

  return undefined;
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
  const queryEngine = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const productModuleService = req.scope.resolve(
    Modules.PRODUCT,
  ) as IProductModuleService;

  const authToken = req.headers["x-sanity-sync-token"] as string | undefined;

  const projectId =
    process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;

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

    const sanityDocumentId = Array.isArray(sanityDocumentIdHeader)
      ? sanityDocumentIdHeader[0]
      : sanityDocumentIdHeader;

    const sanityOperation = Array.isArray(sanityOperationHeader)
      ? sanityOperationHeader[0]
      : sanityOperationHeader;

    const uncheckedBody = rawPayload as Record<string, any>;
    const incomingId: string =
      uncheckedBody._id || uncheckedBody.productData?._id || "";

    const isBackgroundEchoWebhook =
      uncheckedBody.event === "product.updated" ||
      uncheckedBody.action === "sync" ||
      (!rawPayload.documentType && !rawPayload._type && !sanityOperationHeader);

    if (isBackgroundEchoWebhook) {
      if (typeof req._releaseSyncLock === "function") {
        req._releaseSyncLock();
      }
      res.status(200).json({
        success: true,
        syncStatus: "ignored",
        message: "Background execution loop bypassed during integration tests.",
      });
      return;
    }

    const incomingCmsProduct: Partial<SanityRawProductInput> =
      rawPayload.productData || rawPayload;
    logger.info(
      `[DEBUG]: payload in the route file ${JSON.stringify(rawPayload, null, 2)}`,
    );

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

    if (!isDeletion) {
      const isCleanIdLocked = await syncLock.isLocked(`medusa-sync:${cleanId}`);
      const isDocIdLocked = await syncLock.isLocked(
        `medusa-sync:${documentId}`,
      );

      if (isCleanIdLocked || isDocIdLocked) {
        await syncLock.release(`medusa-sync:${cleanId}`);
        await syncLock.release(`medusa-sync:${documentId}`);
        logger.info(
          `[Sanity Sync Guard] Intercepted Medusa-originated echo for [${cleanId}]. Bypassing loop cleanly.`,
        );
        if (req._releaseSyncLock) req._releaseSyncLock();
        res.status(200).json({ success: true, message: "Loop echo blocked" });
        return;
      }
    }

    const IMMUTABLE_OPERATION_TARGET: OperationTypes =
      resolvedRequestContextOperation;
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
        if (req._releaseSyncLock) req._releaseSyncLock();
        res.status(202).json({
          success: true,
          syncStatus: "deferred",
          message: "Draft drop bypassed to secure live data mappings.",
        });
        return;
      }
      logger.info(
        `[Sanity Sync] Deferring execution for un-published draft: [${incomingId}].`,
      );
      if (req._releaseSyncLock) req._releaseSyncLock();
      res.status(202).json({
        success: true,
        syncStatus: "deferred",
        sanityDocumentId: cleanId,
      });
      return;
    }

    const incomingMetadata =
      (incomingCmsProduct?.metadata as Record<string, unknown>) || {};

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

    const documentType =
      rawPayload.documentType ||
      (rawPayload._type === "category" ? "category" : "product");

    const targetLockKey = cleanId ? `${documentType}-${cleanId}` : null;

    if (targetLockKey && (operation === "create" || operation === "update")) {
      if (activeSyncQueues.has(targetLockKey)) {
        operation = "update";
      } else {
        let releaseLockResolver: (() => void) | undefined;
        const currentThreadPromise = new Promise<void>((resolve) => {
          releaseLockResolver = resolve;
        });
        const previousThreadPromise = activeSyncQueues.get(targetLockKey);
        activeSyncQueues.set(targetLockKey, currentThreadPromise);
        if (previousThreadPromise) {
          await previousThreadPromise;
          operation = "update";
        }
        (req as any)._releaseSyncLock = () => {
          releaseLockResolver?.();
          if (activeSyncQueues.get(targetLockKey) === currentThreadPromise)
            activeSyncQueues.delete(targetLockKey);
        };
      }
    }

    const standardPerspectives = ["raw", "published", "production"];
    const hasInvalidPerspective =
      (urlPerspective && !standardPerspectives.includes(urlPerspective)) ||
      (bodyPerspectives.length > 0 &&
        !bodyPerspectives.some((p) => standardPerspectives.includes(p)));

    if (hasInvalidPerspective) {
      if (typeof req._releaseSyncLock === "function") {
        req._releaseSyncLock();
      }
      res.status(200).json({
        success: true,
        syncStatus: "ignored",
        message:
          "Medusa catalog updates are exclusively locked to Published perspectives.",
      });
      return;
    }

    if (incomingCmsProduct.slug) {
      let extractedSlugString = "";
      if (
        typeof incomingCmsProduct.slug === "object" &&
        "current" in incomingCmsProduct.slug
      ) {
        extractedSlugString = incomingCmsProduct.slug.current;
      } else if (typeof incomingCmsProduct.slug === "string") {
        extractedSlugString = incomingCmsProduct.slug;
      }

      if (extractedSlugString) {
        const rawPayloadRef = rawPayload as any;
        if (rawPayloadRef.productData) {
          rawPayloadRef.productData.slug = { current: extractedSlugString };
        }
      }
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

      if (
        operation === "delete" ||
        IMMUTABLE_OPERATION_TARGET === "delete" ||
        isDeletion
      ) {
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

        if (targetCategory.products && targetCategory.products.length > 0) {
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

        if (req._releaseSyncLock) req._releaseSyncLock();
        res.status(200).json({
          success: true,
          message: "Category deletion synced successfully.",
          operation: "delete",
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
          await productModuleService.createProductCategories([
            {
              name: categoryTitle,
              handle: extractedCategorySlug,
              description: categoryDescription,
              is_active: true,
              metadata: {
                sanity_id: sanityId,
                is_sync_origin: "sanity",
              },
            },
          ]);
        } else {
          await productModuleService.updateProductCategories(categories[0].id, {
            name: categoryTitle,
            is_active: true,
            description: categoryDescription,
            metadata: {
              ...categories[0].metadata,
              sanity_id: sanityId,
              is_sync_origin: "sanity",
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
      const cleanId = cleanSanityId(sanityDocId);
      const isCleanIdLocked = await syncLock.isLocked(
        `medusa-delete:${cleanId}`,
      );
      const isDocIdLocked = await syncLock.isLocked(
        `medusa-delete:${sanityDocId}`,
      );
      if (isCleanIdLocked || isDocIdLocked) {
        await syncLock.release(`medusa-delete:${cleanId}`);
        await syncLock.release(`medusa-delete:${sanityDocId}`);
        logger.info(
          `[Sanity Sync Guard] Intercepted Medusa-initiated delete for [${cleanId}]. Loop blocked.`,
        );
        if (req._releaseSyncLock) req._releaseSyncLock();
        res
          .status(200)
          .json({ success: true, message: "Deletion echo blocked" });
        return;
      }

      let targetProduct: { id: string; handle: string } | undefined;

      // Check if sanityDocId is already a Medusa ID
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
        if (req._releaseSyncLock) req._releaseSyncLock();
        res.status(200).json({
          success: true,
          message: "Product deletion synced successfull",
        });
        return;
      }

      // This prevents the Medusa hook above from calling Sanity delete again!
      await syncLock.acquire(`sanity-delete:${targetProduct.id}`, 15);

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
      if (req._releaseSyncLock) req._releaseSyncLock();
      res.status(200).json({
        success: true,
        message: "Product deletion synced successfully.",
        operation: "delete",
      });
      return;
    }

    if (!cmsProduct || !cmsProduct._id) {
      if (req._releaseSyncLock) req._releaseSyncLock();
      res
        .status(400)
        .json({ error: "Invalid single product payload received." });
      return;
    }

    const categoryPayload: SanityCategoryPayload[] = [];
    const rawCategories = cmsProduct.categories || rawPayload.categories || [];

    if (Array.isArray(rawCategories)) {
      for (const rawCategory of rawCategories) {
        if (!rawCategory) continue;

        const rawRef =
          typeof rawCategory === "object"
            ? rawCategory._ref || rawCategory._id
            : rawCategory;

        if (!rawRef) continue;

        let referenceId = String(rawRef).replace(/^drafts\./, "");
        if (referenceId.startsWith("category-")) {
          referenceId = referenceId.replace(/^category-/, "");
        }

        let matchedCategory:
          { id: string; handle: string; name?: string } | undefined;

        if (referenceId) {
          for (const candidateId of getSanityIdCandidates(referenceId)) {
            const { data: matchedCategories } = await queryEngine.graph({
              entity: "product_category",
              fields: ["id", "handle", "name"],
              filters: {
                metadata: { sanity_id: candidateId },
              } as Record<string, unknown>,
            });
            const baseCat = Array.isArray(matchedCategories)
              ? matchedCategories[0]
              : undefined;
            if (baseCat) {
              matchedCategory = {
                id: baseCat.id,
                handle: baseCat.handle as string,
                name: baseCat.name as string,
              };
              break;
            }
          }
          if (matchedCategory) {
            categoryPayload.push(matchedCategory as SanityCategoryPayload);
          }
        }
      }
    }
    const rawSlug =
      extractCategorySlug(cmsProduct.slug) || `prod-${cmsProduct._id}`;
    const normalizedSlug = sanitizeHandle(rawSlug);
    const resolvedCategoryPayloads = categoryPayload.filter(
      (payload, index, self) =>
        self.findIndex((p) => p.id === payload.id) === index,
    );

    if (resolvedCategoryPayloads.length === 0) {
      if (req._releaseSyncLock) req._releaseSyncLock();
      res.status(400).json({
        success: false,
        error:
          "Product cannot be published until it references an existing Medusa category. Create and sync a category in Sanity, then assign it to the product.",
      });
      return;
    }

    const rawImages =
      cmsProduct.images ||
      rawPayload.productData?.images ||
      rawPayload.images ||
      [];
    const mappedImages: SanityImagePayload[] = [];

    if (Array.isArray(rawImages)) {
      rawImages.forEach((image: SanityRawImageInput, index: number) => {
        if (!image) return;
        let resolvedToken =
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
          let resolvedEnText = "Product catalog image";
          if (typeof image.alt_en === "string" && image.alt_en.trim() !== "") {
            resolvedEnText = image.alt_en;
          } else if (typeof image.alt === "string" && image.alt.trim() !== "") {
            resolvedEnText = image.alt;
          }

          const computedKey =
            (image._key as string) || `img_${index}_${Date.now()}`;

          mappedImages.push({
            _type: "image",
            _key: computedKey,
            id: ((image.id as string) || computedKey) as string,
            url: cleanCdnUrl,
            alt: resolvedEnText,
            alt_en: resolvedEnText,
            alt_fr: (image.alt_fr || "") as string,
            alt_ar: (image.alt_ar || "") as string,
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

    const incomingMetaTrans =
      (incomingCmsProduct?.metadata?.translations as Record<string, any>) || {};

    logger.info(
      `[DEBUG ROUTE FILE] trans in the route file ${JSON.stringify(incomingMetaTrans, null, 2)}`,
    );

    const titleEn =
      String(
        (cmsProduct.title as any)?.en ??
          incomingMetaTrans?.en?.title ??
          (typeof cmsProduct.title === "string" ? cmsProduct.title : ""),
      ).trim() || "Untitled Product";

    const titleFr = String(
      (cmsProduct.title as any)?.fr ?? incomingMetaTrans?.fr?.title ?? "",
    ).trim();

    const titleAr = String(
      (cmsProduct.title as any)?.ar ?? incomingMetaTrans?.ar?.title ?? "",
    ).trim();

    const descEn = String(
      (cmsProduct.description as any)?.en ??
        incomingMetaTrans?.en?.description ??
        (typeof cmsProduct.description === "string"
          ? cmsProduct.description
          : ""),
    ).trim();

    const descFr = String(
      (cmsProduct.description as any)?.fr ??
        incomingMetaTrans?.fr?.description ??
        "",
    ).trim();

    const descAr = String(
      (cmsProduct.description as any)?.ar ??
        incomingMetaTrans?.ar?.description ??
        "",
    ).trim();

    const rawHighlights =
      incomingCmsProduct.highlights ||
      cmsProduct.highlights ||
      incomingMetadata.highlights ||
      [];

    const rawSeo: SanitySEOPayload =
      incomingCmsProduct.seo || cmsProduct.seo || incomingMetadata.seo || {};

    const keywords: string[] = Array.isArray(rawSeo.keywords)
      ? rawSeo.keywords.map((k: any) => String(k).trim()).filter(Boolean)
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

    const materialEn =
      String(
        (cmsProduct.material as any)?.en ??
          incomingMetaTrans?.en?.material ??
          (typeof cmsProduct.material === "string" ? cmsProduct.material : ""),
      ).trim() || "";
    const materialAr =
      String(
        (cmsProduct.material as any)?.ar ??
          incomingMetaTrans?.ar?.material ??
          "",
      ).trim() ||
      "" ||
      "";
    const materialFr =
      String(
        (cmsProduct.material as any)?.fr ??
          incomingMetaTrans?.fr?.material ??
          "",
      ).trim() || "";

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
      _id: cmsProduct._id,
      title: titleEn,
      material: materialEn,
      subtitle: titleFr || "",
      description: descEn,
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
        image_metadata,
      },
      weightGrams: cmsProduct.weightGrams,
      lengthMm: cmsProduct.lengthMm,
      widthMm: cmsProduct.widthMm,
      heightMm: cmsProduct.heightMm,
      originCountry: cmsProduct.originCountry?.toLowerCase(),
      categories: resolvedCategoryPayloads,
      images: mappedImages,
      manage_inventory: cmsProduct.manage_inventory ?? true,
      allow_backorder: cmsProduct.allow_backorder ?? false,
    };

    logger.info(
      `[debug route]; standardizedProductData: ${JSON.stringify(standardizedProductData, null, 2)}`,
    );

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

    let targetMedusaProductId: string | undefined;

    // Check if the cleanId itself is a Medusa ID
    if (cleanId.startsWith("prod_")) {
      const { data: byId } = await queryEngine.graph({
        entity: "product",
        fields: ["id"],
        filters: { id: cleanId },
      });
      targetMedusaProductId = byId?.[0]?.id;
    }

    // Otherwise lookup by metadata sanity_id
    if (!targetMedusaProductId) {
      for (const candidateId of getSanityIdCandidates(cleanId)) {
        const { data: matchedProducts } = await queryEngine.graph({
          entity: "product",
          fields: ["id"],
          filters: {
            metadata: { sanity_id: candidateId },
          } as Record<string, any>,
        });
        if (matchedProducts?.[0]?.id) {
          targetMedusaProductId = matchedProducts[0].id;
          break;
        }
      }
    }

    // Lock target product for 15 SECONDS before workflow triggers Medusa subscribers
    if (targetMedusaProductId) {
      await syncLock.acquire(`sanity-sync:${targetMedusaProductId}`, 15);
    }

    const workflowResponse = await sanitySyncProductWorkflow(req.scope).run({
      input: standardizedInput,
    });

    const createdOrUpdatedId = targetMedusaProductId;

    if (createdOrUpdatedId) {
      await syncLock.acquire(`sanity-sync:${createdOrUpdatedId}`, 15);
    }

    const medusaOperation = workflowResponse?.result?.operation || operation;
    logger.info(
      `[Sanity Sync Hook] Completed Sanity [${operation}] for [${cmsProduct._id}]; Medusa outcome: [${medusaOperation}].`,
    );

    res.status(200).json({
      success: workflowResponse?.result?.success ?? true,
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
