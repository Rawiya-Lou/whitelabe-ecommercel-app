import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { SANITY_MODULE } from "../../../modules/sanity-sync/index";
import SanityModuleService from "../../../modules/sanity-sync/service";
import { syncLock } from "../../../utils/sync-lock";
import {
  SanityRawImageInput,
  SanityLocalizedString,
  SanityImagePayload,
} from "../types";

export const syncProductToSanityStep = createStep(
  "sync-product-to-sanity",
  async (
    productId: string,
    { container },
  ): Promise<StepResponse<Record<string, unknown>>> => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const sanityService = container.resolve<SanityModuleService>(SANITY_MODULE);

    const isLocked = await syncLock.isLocked(`sanity-sync:${productId}`);
    if (isLocked) {
      await syncLock.release(`sanity-sync:${productId}`);
      return new StepResponse({ skipped: true, reason: "loop_blocked" });
    }

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
        "categories.id",
        "categories.metadata",
        "images.id",
        "images.url",
      ],
      filters: { id: productId },
    });

    const product = products?.[0];
    if (!product)
      return new StepResponse({ skipped: true, reason: "not_found" });

    const metadata = (product.metadata ?? {}) as Record<string, any>;
    const translations = (metadata.translations as Record<string, any>) || {};
    const sanityId = (metadata.sanity_id as string) || product.id;

    const titleObj: SanityLocalizedString & { _type: string } = {
      _type: "localizedString",
      en: product.title || translations.en?.title || "",
      fr: product.subtitle || translations.fr?.title || "",
      ar: translations.ar?.title || "",
    };

    const descObj: SanityLocalizedString & { _type: string } = {
      _type: "localizedText",
      en: product.description || translations.en?.description || "",
      fr: translations.fr?.description || "",
      ar: translations.ar?.description || "",
    };
    const materialObj: SanityLocalizedString & { _type: string } = {
      _type: "localizedText",
      en: product.material || translations.en?.material || "",
      fr: translations.fr?.material || "",
      ar: translations.ar?.material || "",
    };

    const categories = (product.categories || []).map((cat: any) => ({
      _type: "reference",
      _ref: cat.metadata?.sanity_id || `cat-${cat.id}`,
      _key: `cat_${cat.id}`,
      _weak: false,
    }));

    const medusaImages = product.images || [];
    const savedImageMetadata = Array.isArray(product?.metadata?.image_metadata)
      ? product?.metadata?.image_metadata
      : [];
    const existingSanityImages =
      ((medusaImages ||
        savedImageMetadata) as unknown as SanityImagePayload[]) || [];

    const finalSanityImages = medusaImages
      .map((medusaImage: SanityRawImageInput, idx: number) => {
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
          assetRef = matchedSanityImage.asset?._ref || "";
        }

        if (!assetRef) {
          try {
            const urlParts = imageUrl.split("/images/");
            if (urlParts.length >= 2) {
              const pathSegments = urlParts[1].split("/");
              if (pathSegments.length >= 3) {
                const filename = pathSegments[2];
                const lastDotIndex = filename.lastIndexOf(".");
                if (lastDotIndex !== -1) {
                  assetRef = `image-${filename.substring(0, lastDotIndex)}-${filename.substring(lastDotIndex + 1)}`;
                }
              }
            }
          } catch (e) {}
        }

        const altData = matchedMedusaMeta.alt || {};
        const sanityAltData = (matchedSanityImage as SanityImagePayload) || {};

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
        } as SanityImagePayload;
      })
      .filter((img: any) => img !== null && img.asset._ref !== "");

    const patchSet: Record<string, any> = {
      title: titleObj,
      slug: { _type: "slug", current: product.handle || product.id },
      description: descObj,
      material: materialObj,
      medusaId: product.id,
      updatedBy: "medusa",
      categories,
      images: finalSanityImages,
    };

    await syncLock.acquire(`medusa-sync:${sanityId}`, 15);
    await sanityService.mutate([
      { createIfNotExists: { _id: sanityId, _type: "product" } },
      { patch: { id: sanityId, set: patchSet } },
    ]);

    return new StepResponse({ success: true, productId });
  },
);
