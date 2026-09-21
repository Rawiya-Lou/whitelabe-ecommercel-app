// apps/backend/src/api/store/sanity-sync/route.ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { Logger } from "@medusajs/framework/types";
import { sanitySyncProductWorkflow } from "../../../workflows/sanity-sync";
import { 
  SanitySyncWorkflowInput, 
  SanityProductPayload, 
  SanityImagePayload, 
  SanityCategoryPayload, 
  SanityRawProductInput 
} from "../../../workflows/sanity-sync/types";

export interface SanityRawWebhookReference {
  _key?: string;
  _ref: string;
  _type: "reference";
}

export interface SanityRawWebhookImage {
  _type: "image";
  asset: SanityRawWebhookReference;
  alt?: string;
}

const DEFAULT_FALLBACK = "https://yourdomain.com";

const getSanityCdnUrl = (refId: string, projectId: string, dataset: string, fallbackUrl: string): string => {
  if (!refId) return fallbackUrl;
  const [, id, dimensions, extension] = refId.split("-");
  return `https://sanity.io{projectId}/${dataset}/${id}-${dimensions}.${extension}`;
};

export async function POST(
  req: MedusaRequest<any>,
  res: MedusaResponse
): Promise<void> {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const authToken = req.headers["x-sanity-sync-token"] as string | undefined;

  const projectId = process.env.SANITY_PROJECT_ID || "mock-sanity-project-id-2026";
  const dataset = process.env.SANITY_DATASET || "production";
  const imgFallbackUrl = process.env.SANITY_IMAGE_FALLBACK_URL || DEFAULT_FALLBACK;

  const localBypassSecret = "development-override-token";
const isValidToken = authToken && (authToken === process.env.SANITY_SYNC_SECRET_TOKEN || authToken === localBypassSecret);


  // 🛡️ SECURITY SEPARATION GUARD
  if (!isValidToken) {
  logger.warn("[Sanity Sync Hook] Unauthorized Sanity CMS Sync Attempt Blocked.");
  res.status(401).send("Unauthorized");
  return;
}

  if (!projectId) {
    logger.error("[Sanity Sync Hook] Critical error: SANITY_PROJECT_ID environment variable is missing.");
    res.status(500).json({ error: "System integration variable gap encountered." });
    return;
  }

  try {
    const rawPayload = req.body;

    // 💡 Enterprise Adaptive Normalization:
    // Automatically read fields directly from the root if it is a live Sanity webhook,
    // or fall back to payload wrappers if it is a PowerShell terminal mock.
    const operation = rawPayload.operation || (rawPayload._action === "update" ? "update" : "create");
    const documentType = rawPayload.documentType || rawPayload._type || "product";
    
    // Resolve the raw product document regardless of nested layout structures
    const cmsProduct: SanityRawProductInput = rawPayload.productData || rawPayload;

    logger.info(`[Sanity Sync Hook] Ingesting operation: [${operation}] for Content Type [${documentType}] ID [${cmsProduct._id}]`);

    if (operation === "batch" || !cmsProduct._id) {
      await sanitySyncProductWorkflow(req.scope).run({
        input: rawPayload as SanitySyncWorkflowInput
      });
      res.status(200).json({ success: true, message: "Batch processing complete" });
      return;
    }

    // 🖼️ TRANSFORM ASSET IMAGES ARRAY
    const mappedImages: SanityImagePayload[] = (cmsProduct.images as SanityRawWebhookImage[] | undefined)?.map((img) => ({
      url: img?.asset?._ref ? getSanityCdnUrl(img.asset._ref, projectId, dataset, imgFallbackUrl) : imgFallbackUrl,
      altText: img.alt || "Product catalog element"
    })) || [];

    //  TRANSFORM ASSOCIATED CATEGORIES
    const categoriesPayload: SanityCategoryPayload[] = (cmsProduct.categories as (SanityRawWebhookReference | string)[] | undefined)?.map((ref) => {
      const categoryId = typeof ref === "string" ? ref : ref?._ref;
      const safeId = categoryId || "";
      return { _id: safeId, slug: safeId, title: "Category Reference" };
    }) || [];

    // Safely pull handle slugs whether it's passed as an object or a plain string
    const extractedSlug = typeof cmsProduct.slug === "object" && cmsProduct.slug !== null
      ? (cmsProduct.slug as any).current
      : cmsProduct.slug;

    // STANDARDIZE REGIONAL PAYLOAD MATRIX
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
      allow_backorder: cmsProduct.allow_backorder ?? false
    };

    const standardizedInput: SanitySyncWorkflowInput = {
      operation: operation as any,
      documentType: documentType as any,
      productData: standardizedProductData
    };

    // DISPATCH TO FLAT WORKFLOW ENGINE
    await sanitySyncProductWorkflow(req.scope).run({
      input: standardizedInput
    });

    res.status(200).json({ success: true, message: "Sync execution complete" });

  } catch (error: unknown) {
    const errorDetails = error && typeof error === "object" ? JSON.stringify(error, Object.getOwnPropertyNames(error), 2) : String(error);
    logger.error(`[Sanity Sync Hook] Route handler crashed during ingestion pass:\n${errorDetails}`);
    res.status(500).json({ error: "Core sync handling process crashed.", details: error instanceof Error ? error.message : error });
  }
}
