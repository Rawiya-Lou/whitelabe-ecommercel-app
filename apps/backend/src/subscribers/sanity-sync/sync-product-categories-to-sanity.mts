import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createClient } from "@sanity/client";
import {
  SanityLocalizedString,
  SanityOpenGraphImage,
  SanitySEOPayload,
} from "../../workflows/sanity-sync/types.js";
import { syncLock } from "../../utils/sync-lock.js";

interface ProductCategoryLinkPayload {
  id?: string;
  product_id?: string;
}

export default async function syncProductCategoriesToSanity({
  event: { name: eventName, data },
  container,
}: SubscriberArgs<ProductCategoryLinkPayload>): Promise<void> {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const projectId =
    process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
  const dataset =
    process.env.SANITY_DATASET ||
    process.env.SANITY_STUDIO_DATASET ||
    "production";
  const sanityToken = process.env.SANITY_API_TOKEN;

  if (!sanityToken || !projectId) {
    logger.warn(
      "[Sanity Sync Sub] Integration credentials missing; skipping process.",
    );
    return;
  }

  const targetProductId = data.product_id || data.id;
  if (!targetProductId) return;

  const sanityClient = createClient({
    projectId: projectId,
    dataset: dataset,
    token: sanityToken,
    apiVersion: "2024-01-01",
    useCdn: false,
  });


  if (eventName === "product.deleted") {
    logger.info(`[Sanity Sync Sub] Detected product.deleted for Medusa ID [${targetProductId}].`);

    try {
      const matchingDocs = await sanityClient.fetch<{ _id: string }[]>(
        `*[_type == "product" && (medusaId == $id || _id == $id || _id == "drafts." + $id)]{ _id }`,
        { id: targetProductId }
      );

      if (!matchingDocs || matchingDocs.length === 0) {
        logger.info(`[Sanity Sync Sub] No linked document found in Sanity for [${targetProductId}].`);
        return;
      }

      const deleteMutations = matchingDocs.map((doc) => ({
        delete: { id: doc._id },
      }));

      await syncLock.acquire(`medusa-sync:${targetProductId}`, 20);

      const result = await sanityClient.mutate(deleteMutations);
      logger.info(
        `✔ [Sanity Sync Sub] Successfully deleted ${matchingDocs.length} document(s) from Sanity for Medusa product [${targetProductId}].`,
      );
      return;
    } catch (err: any) {
      logger.error(`[Sanity Sync Sub] Failed to delete product in Sanity: ${err?.message || err}`);
      await syncLock.release(`medusa-sync:${targetProductId}`);
      return;
    }
  }


  const isCleanTargetProductId = await syncLock.isLocked(
    `sanity-sync:${targetProductId}`,
  );
  if (isCleanTargetProductId) {
    await syncLock.release(`sanity-sync:${targetProductId}`);
    logger.info(
      `[Sanity Loop Guard] Blocked echo back to Sanity for [${targetProductId}].`,
    );
    return;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "subtitle",
      "handle",
      "material",
      "origin_country",
      "tags.value",
      "description",
      "metadata",
      "variants.id",
      "variants.material",
      "variants.origin_country",
      "categories.id",
      "categories.name",
      "categories.metadata",
      "images.id",
      "images.url",
      "images.metadata",
    ],
    filters: { id: targetProductId },
  });

  const product = products?.[0];
  if (!product) return;

  const defaultVariant = product.variants?.[0] || {};
  const productMetadata = (product.metadata ?? {}) as Record<string, any>;
  const sanityProductId = productMetadata.sanity_id as string;
  const medusaTranslations =
    (productMetadata.translations as Record<string, any>) || {};
  const medusaProductHandle = product.handle;

  let existingSanityProduct: any = null;
  try {
    const fetchedDocs = await sanityClient.fetch(
      `*[_id == $id || _id == "drafts." + $id || medusaId == $medusaId || slug.current == $handle] | order(_updatedAt desc){ 
        _id, 
        title,
        description,
        material,
        highlights,
        seo,
        categories,
        images
      }`,
      {
        id: sanityProductId || product.id,
        medusaId: product.id,
        handle: medusaProductHandle || "",
      },
    );
    existingSanityProduct = fetchedDocs?.[0] || null;
  } catch (e) {
    logger.error(
      `[Sanity Sync Sub] Cannot query live text data state from Sanity: ${e}`,
    );
  }

  const activeSanityDocId =
    existingSanityProduct?._id || sanityProductId || product.id;
  const cleanSanityId = activeSanityDocId.replace(/^drafts\./, "");

  const titleObj: SanityLocalizedString & { _type: string } = {
    _type: "localizedString",
    en: String(
      product.title ||
        medusaTranslations.en?.title ||
        productMetadata.title_en ||
        existingSanityProduct?.title?.en ||
        "",
    ).trim(),
    fr: String(
      product.subtitle ||
        medusaTranslations.fr?.title ||
        productMetadata.title_fr ||
        existingSanityProduct?.title?.fr ||
        "",
    ).trim(),
    ar: String(
      medusaTranslations.ar?.title ||
        productMetadata.title_ar ||
        existingSanityProduct?.title?.ar ||
        "",
    ).trim(),
  };

  const materialObj: SanityLocalizedString & { _type: string } = {
    _type: "localizedString",
    en: String(
      medusaTranslations.en?.material ||
        product.material ||
        defaultVariant.material ||
        productMetadata.material_en ||
        existingSanityProduct?.material?.en ||
        "",
    ).trim(),
    fr: String(
      medusaTranslations.fr?.material ||
        productMetadata.material_fr ||
        existingSanityProduct?.material?.fr ||
        "",
    ).trim(),
    ar: String(
      medusaTranslations.ar?.material ||
        productMetadata.material_ar ||
        existingSanityProduct?.material?.ar ||
        "",
    ).trim(),
  };

  const descriptionObj: SanityLocalizedString & { _type: string } = {
    _type: "localizedText",
    en: String(
      product.description ||
        medusaTranslations.en?.description ||
        productMetadata.description_en ||
        existingSanityProduct?.description?.en ||
        "",
    ).trim(),
    fr: String(
      medusaTranslations.fr?.description ||
        productMetadata.description_fr ||
        existingSanityProduct?.description?.fr ||
        "",
    ).trim(),
    ar: String(
      medusaTranslations.ar?.description ||
        productMetadata.description_ar ||
        existingSanityProduct?.description?.ar ||
        "",
    ).trim(),
  };

  const pulledTags: string[] = Array.isArray(productMetadata.tags)
    ? (productMetadata.tags as string[])
    : Array.isArray(product.tags)
      ? product.tags
          .map((t: any) => (typeof t === "string" ? t : t?.value || ""))
          .filter(Boolean)
      : [];

  const rawCountry =
    product.origin_country ||
    defaultVariant.origin_country ||
    productMetadata.originCountry ||
    "";
  const resolvedCountry = String(rawCountry).trim().toUpperCase().slice(0, 2);

  const rawHighlights =
    productMetadata.highlights || existingSanityProduct?.highlights || [];
  let formattedHighlights: any[] = [];

  if (Array.isArray(rawHighlights)) {
    formattedHighlights = rawHighlights.map((hl: any, idx: number) => ({
      _type: "localizedString",
      _key: hl._key || `hl_${idx}`,
      en: hl.en || (typeof hl === "string" ? hl : ""),
      fr: hl.fr || "",
      ar: hl.ar || "",
    }));
  }

  const rawSeo: SanitySEOPayload =
    productMetadata.seo || existingSanityProduct?.seo || {};
  const ogAssetRef =
    rawSeo.openGraphImage?.assetId ||
    rawSeo.openGraphImage?.asset?._ref ||
    existingSanityProduct?.seo?.openGraphImage?.asset?._ref ||
    "";

  const formattedSeo: SanitySEOPayload = {
    metaTitle: {
      _type: "localizedString",
      en: rawSeo.metaTitle?.en || "",
      fr: rawSeo.metaTitle?.fr || "",
      ar: rawSeo.metaTitle?.ar || "",
    } as SanityLocalizedString & { _type: string },
    metaDescription: {
      _type: "localizedText",
      en: rawSeo.metaDescription?.en || "",
      fr: rawSeo.metaDescription?.fr || "",
      ar: rawSeo.metaDescription?.ar || "",
    } as SanityLocalizedString & { _type: string },
    keywords: Array.isArray(rawSeo.keywords) ? rawSeo.keywords : [],
  };

  if (ogAssetRef) {
    formattedSeo.openGraphImage = {
      _type: "image",
      asset: {
        _type: "reference",
        _ref: ogAssetRef,
      },
    } as SanityOpenGraphImage;
  }

  const categories = (product.categories || []).flatMap((category) => {
    if (!category) return [];
    const refId =
      typeof category.metadata?.sanity_id === "string"
        ? category.metadata.sanity_id
        : `category-${category.id.replace(/_/g, "-")}`;
    return [
      {
        _type: "reference",
        _ref: String(refId).replace(/^drafts\./, ""),
        _key: `cat_${category.id}`,
      },
    ];
  });

  const medusaImages = product.images || [];
  const savedImageMetadata = Array.isArray(productMetadata.image_metadata)
    ? productMetadata.image_metadata
    : [];
  const existingSanityImages = existingSanityProduct?.images || [];

  const finalSanityImages = medusaImages
    .map((medusaImage: any, idx: number) => {
      const imageUrl = medusaImage.url;
      if (!imageUrl || typeof imageUrl !== "string") return null;

      const matchedMedusaMeta =
        savedImageMetadata.find((m: any) => m.url === imageUrl) ||
        savedImageMetadata[idx] ||
        {};
      let assetRef = matchedMedusaMeta.sanity_asset_id || "";

      const matchedSanityImage = existingSanityImages.find((sImg: any) => {
        const sanityRef = sImg.asset?._ref || sImg._ref || "";
        return (
          sImg._key === medusaImage.id ||
          (sanityRef !== "" && sanityRef === assetRef) ||
          sImg.url === imageUrl
        );
      });

      if (!assetRef && matchedSanityImage) {
        assetRef =
          matchedSanityImage.asset?._ref || matchedSanityImage._ref || "";
      }

      const altData = matchedMedusaMeta.alt || {};
      const sanityAltData = matchedSanityImage || {};

      return {
        _type: "image",
        _key:
          matchedMedusaMeta.sanity_asset_id || medusaImage.id || `img_${idx}`,
        asset: {
          _type: "reference",
          _ref: assetRef || "",
        },
        alt_en: String(
          altData.en || medusaImage.alt || sanityAltData.alt_en || "",
        ).trim(),
        alt_fr: String(altData.fr || sanityAltData.alt_fr || "").trim(),
        alt_ar: String(altData.ar || sanityAltData.alt_ar || "").trim(),
      };
    })
    .filter((img: any) => img !== null && img.asset._ref !== "");

  await syncLock.acquire(`medusa-sync:${cleanSanityId}`, 15);
  await syncLock.acquire(`medusa-sync:${activeSanityDocId}`, 15);

  const patchSet: Record<string, any> = {
    title: titleObj,
    description: descriptionObj,
    medusaId: product.id,
    updatedBy: "medusa",
    material: materialObj,
    originCountry: resolvedCountry,
    tags: pulledTags,
    categories: categories,
    images: finalSanityImages,
  };

  if (formattedHighlights.length > 0) {
    patchSet.highlights = formattedHighlights;
  }

  if (
    formattedSeo?.metaTitle?.en ||
    formattedSeo?.metaDescription?.en ||
    ogAssetRef ||
    formattedSeo?.keywords?.length
  ) {
    patchSet.seo = formattedSeo;
  }

  try {
    await sanityClient.mutate([
      {
        createIfNotExists: {
          _id: cleanSanityId,
          _type: "product",
        },
      },
      {
        patch: {
          id: activeSanityDocId,
          set: patchSet,
        },
      },
    ]);

    logger.info(
      `[Sanity Sync Sub] Reverse sync patched successfully for Medusa product [${targetProductId}].`,
    );
  } catch (error) {
    logger.error(`[Sanity Sync Sub] Sync mutation failed: ${error}`);
    await syncLock.release(`medusa-sync:${cleanSanityId}`);
    await syncLock.release(`medusa-sync:${activeSanityDocId}`);
  }
}

export const config: SubscriberConfig = {
  event: [
    "product.updated",
    "product.created",
    "product.deleted",
    "product.variant.updated",
    "product.variant.created",
    "product-category.attached",
    "product-category.detached",
    "product-category.deleted",
  ],
};