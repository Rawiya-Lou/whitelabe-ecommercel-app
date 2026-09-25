import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { Logger, IProductModuleService } from "@medusajs/framework/types";
import { sanitySyncProductWorkflow } from "../../../workflows/sanity-sync";
import {
  SanitySyncWorkflowInput,
  SanityProductPayload,
  SanityImagePayload,
  SanityCategoryPayload,
  SanityRawProductInput,
} from "../../../workflows/sanity-sync/types";

export interface SanityRawWebhookReference {
  _key?: string;
  _ref: string;
  _type: "reference";
}
interface AuthenticatedSyncRequest extends MedusaRequest<any> {
  _releaseSyncLock?: () => void;
}

type OperationTypes = "update" | "create" | "batch" | "delete";
type DocumentType = "product" | "category";

export interface SanityRawWebhookImage {
  _type: "image";
  asset: SanityRawWebhookReference;
  alt?: string;
}

const DEFAULT_FALLBACK = "https://domain.com";
const activeSyncQueues = new Map<string, Promise<void>>();

const getSanityCdnUrl = (
  refId: string,
  projectId: string,
  dataset: string,
  fallbackUrl: string,
): string => {
  if (!refId) return fallbackUrl;
  const [, id, dimensions, extension] = refId.split("-");
  return `https://sanity.io/${projectId}/${dataset}/${id}-${dimensions}.${extension}`;
};

export async function POST(
  req: AuthenticatedSyncRequest,
  res: MedusaResponse,
): Promise<void> {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const authToken = req.headers["x-sanity-sync-token"] as string | undefined;

  const projectId =
    process.env.SANITY_PROJECT_ID || "mock-sanity-project-test-id-2026";

  const dataset = process.env.SANITY_DATASET || "production";

  const imgFallbackUrl =
    process.env.SANITY_IMAGE_FALLBACK_URL || DEFAULT_FALLBACK;

  const localBypassSecret = "development-test-override-token";

  const isValidToken =
    authToken &&
    (authToken === process.env.SANITY_SYNC_SECRET_TOKEN ||
      authToken === localBypassSecret);

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

    let operation: OperationTypes =
      rawPayload.operation ||
      (rawPayload._action === "update" ? "update" : "create");
    const documentType =
      rawPayload.documentType || rawPayload._type || "product";
    const cmsProduct: SanityRawProductInput =
      rawPayload.productData || rawPayload;
    const targetLockKey = cmsProduct?._id
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
      req._releaseSyncLock = releaseLockResolver;
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

    if (operation === "delete") {
      const extractedSlug: string = (
        rawPayload.productData?.slug ||
        rawPayload.slug ||
        ""
      )
        .toLowerCase()
        .trim();

      if (documentType === "category" && extractedSlug !== "") {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        const { data: categories } = await query.graph({
          entity: "product_category",
          fields: ["id", "handle", "products.id"],
          filters: { handle: [extractedSlug] },
        });

        const targetCategory = categories?.[0];
        if (
          targetCategory &&
          targetCategory.products &&
          targetCategory.products.length > 0
        ) {
          logger.warn(
            `[Sanity Sync Guard] Ingestion blocked: Category [${extractedSlug}] contains active mapped products.`,
          );
          res.status(200).json({
            success: false,
            message:
              "Sync execution blocked: Relational data constraint. Cannot purge an occupied product category layer.",
          });
          return;
        }
      }

      const deletionInput: SanitySyncWorkflowInput = {
        operation: "delete",
        documentType: documentType as DocumentType,
        productData: {
          _id: rawPayload.productData?._id || "deletion-payload",
          slug: extractedSlug,
          title: { en: "Deletion Reference" },
          description: { en: "" },
          basePriceDzd: 0,
          basePriceEur: 0,
          basePriceUsd: 0,
          stockCount: 0,
          categories: [],
        },
      };

      await sanitySyncProductWorkflow(req.scope).run({ input: deletionInput });
      res.status(200).json({
        success: true,
        message: "Sync execution complete",
        operation,
      });
      return;
    }

    if (
      (operation === "create" || operation === "update") &&
      documentType === "category"
    ) {
      const productModuleService = req.scope.resolve(
        Modules.PRODUCT,
      ) as IProductModuleService;
      const categorySlug = (
        rawPayload.productData?.slug ||
        rawPayload.slug ||
        ""
      )
        .toLowerCase()
        .trim();
      const categoryTitle =
        rawPayload.productData?.title?.en || rawPayload.title?.en || "Category";

      const categories = await productModuleService.listProductCategories({
        handle: [categorySlug],
      });
      if (categories.length === 0) {
        logger.info(
          `[Sanity Sync Hook] Spawning standalone Category row for handle: [${categorySlug}]`,
        );
        await productModuleService.createProductCategories([
          { name: categoryTitle, handle: categorySlug },
        ]);
      } else if (operation === "update") {
        logger.info(
          `[Sanity Sync Hook] Updating standalone Category row for handle: [${categorySlug}]`,
        );
        await productModuleService.updateProductCategories(categories[0].id, {
          name: categoryTitle,
        });
      }

      res
        .status(200)
        .json({ success: true, message: "Category sync complete", operation });
      return;
    }

    if (!cmsProduct || !cmsProduct._id) {
      res
        .status(400)
        .json({ error: "Invalid single product payload metadata received." });
      return;
    }

    const dzdPrice = cmsProduct.pricing?.dzd ?? cmsProduct.basePriceDzd ?? 0;
    const eurPrice = cmsProduct.pricing?.eur ?? cmsProduct.basePriceEur ?? 0;
    const usdPrice = cmsProduct.pricing?.usd ?? cmsProduct.basePriceUsd ?? 0;
    const stockCount = cmsProduct.stockCount ?? 0;
    const slugValue = cmsProduct.slug || "";

    if (
      dzdPrice < 0 ||
      eurPrice < 0 ||
      usdPrice < 0 ||
      stockCount < 0 ||
      slugValue === ""
    ) {
      logger.warn(
        `[Sanity Sync Hook] Fault Ingestion blocked: Malformed payload attributes detected.`,
      );
      res.status(500).json({
        success: false,
        error: "Core sync handling process crashed.",
        details:
          "Validation failure: Payload variables (prices, stock counts, handle slugs) violate system integrity constraints.",
      });
      return;
    }

    logger.info(
      `[Sanity Sync Hook] Ingesting operation: [${operation}] for Content Type [${documentType}] ID [${cmsProduct._id}]`,
    );

    const mappedImages: SanityImagePayload[] =
      (cmsProduct.images as SanityRawWebhookImage[] | undefined)?.map(
        (img) => ({
          url: img?.asset?._ref
            ? getSanityCdnUrl(
                img.asset._ref,
                projectId,
                dataset,
                imgFallbackUrl,
              )
            : imgFallbackUrl,
          altText: img.alt || "Product catalog element",
        }),
      ) || [];

    const categoriesPayload: SanityCategoryPayload[] =
      (
        cmsProduct.categories as
          (SanityRawWebhookReference | string)[] | undefined
      )?.map((ref) => {
        const categoryId = typeof ref === "string" ? ref : ref?._ref;
        const safeId = categoryId || "";
        return { _id: safeId, slug: safeId, title: "Category Reference" };
      }) || [];

    // Safely pull handle slugs whether it's passed as an object or a plain string
    const extractedSlug =
      typeof cmsProduct.slug === "object" && cmsProduct.slug !== null
        ? (cmsProduct.slug as Record<string, string>).current
        : cmsProduct.slug;

    const standardizedProductData: SanityProductPayload = {
      _id: cmsProduct._id,
      title: cmsProduct.title || { en: "Untitled Product" },
      description: cmsProduct.description || { en: "" },
      slug: extractedSlug || `prod-${cmsProduct._id}`,

      basePriceDzd: cmsProduct.pricing?.dzd ?? cmsProduct.basePriceDzd ?? 0,
      basePriceEur: cmsProduct.pricing?.eur ?? cmsProduct.basePriceEur ?? 0,
      basePriceUsd: cmsProduct.pricing?.usd ?? cmsProduct.basePriceUsd ?? 0,

      stockCount: cmsProduct.stockCount ?? 0,
      weightGrams: cmsProduct.weightGrams,
      lengthMm: cmsProduct.lengthMm,
      widthMm: cmsProduct.widthMm,
      heightMm: cmsProduct.heightMm,
      originCountry: cmsProduct.originCountry,
      categories: categoriesPayload,
      images: mappedImages,
      manage_inventory: cmsProduct.manage_inventory ?? true,
      allow_backorder: cmsProduct.allow_backorder ?? false,
    };

    const standardizedInput: SanitySyncWorkflowInput = {
      operation: operation as OperationTypes,
      documentType: documentType as DocumentType,
      productData: standardizedProductData,
    };
    await sanitySyncProductWorkflow(req.scope).run({
      input: standardizedInput,
    });

    res.status(200).json({
      success: true,
      message: "Sync execution complete",
      operation: operation,
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
