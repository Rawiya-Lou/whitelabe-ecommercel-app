import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import { IProductModuleService, Logger } from "@medusajs/framework/types";

interface VariantImageLink {
  variantId: string;
  imageIds: string[];
}

interface SyncVariantImagesInput {
  productHandle: string;
  shouldSync?: boolean;
  previousLinks?: VariantImageLink[];
}

interface ImagePair {
  image_id: string;
  variant_id: string;
}

interface VariantImageSyncCompensation {
  added: ImagePair[];
  removed: ImagePair[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const syncVariantImagesFromSanityStep = createStep(
  "sync-variant-images-from-sanity",
  async (
    { productHandle, shouldSync = true, previousLinks = [] }: SyncVariantImagesInput,
    { container },
  ) => {
    if (!shouldSync) {
      return new StepResponse({
        linkedImages: 0,
        addedImages: 0,
        removedImages: 0,
      }, { added: [], removed: [] });
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const productService = container.resolve<IProductModuleService>(
      Modules.PRODUCT,
    );
    const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);

    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "handle",
        "images.id",
        "images.url",
        "variants.id",
        "variants.metadata",
      ],
      filters: { handle: [productHandle] },
    });
    const product = products?.[0] as
      | {
          id: string;
          images?: Array<{ id: string; url: string }>;
          variants?: Array<{
            id: string;
            metadata?: Record<string, unknown> | null;
          }>;
        }
      | undefined;

    if (!product) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Cannot associate Sanity variant images: product "${productHandle}" was not found.`,
      );
    }

    const imageIdByUrl = new Map(
      (product.images ?? []).map((image) => [image.url, image.id]),
    );
    const desiredPairs: ImagePair[] = [];
    for (const variant of product.variants ?? []) {
      const variantImages = Array.isArray(variant.metadata?.variant_images)
        ? variant.metadata.variant_images
        : [];
      for (const image of variantImages) {
        const url = isRecord(image) ? image.url : undefined;
        if (typeof url !== "string" || !url) continue;
        const imageId = imageIdByUrl.get(url);
        if (!imageId) {
          throw new MedusaError(
            MedusaError.Types.UNEXPECTED_STATE,
            `Sanity variant image "${url}" is not present in the Medusa product gallery.`,
          );
        }
        desiredPairs.push({ image_id: imageId, variant_id: variant.id });
      }
    }

    const uniquePairs = (pairs: ImagePair[]) => [
      ...new Map(
        pairs.map((pair) => [
          `${pair.variant_id}:${pair.image_id}`,
          pair,
        ]),
      ).values(),
    ];
    const desired = uniquePairs(desiredPairs);
    const previous = uniquePairs(
      previousLinks.flatMap(({ variantId, imageIds }) =>
        imageIds.map((imageId) => ({
          image_id: imageId,
          variant_id: variantId,
        })),
      ),
    );
    const desiredKeys = new Set(
      desired.map((pair) => `${pair.variant_id}:${pair.image_id}`),
    );
    const previousKeys = new Set(
      previous.map((pair) => `${pair.variant_id}:${pair.image_id}`),
    );
    const added = desired.filter(
      (pair) => !previousKeys.has(`${pair.variant_id}:${pair.image_id}`),
    );
    const removed = previous.filter(
      (pair) => !desiredKeys.has(`${pair.variant_id}:${pair.image_id}`),
    );

    if (removed.length > 0) {
      await productService.removeImageFromVariant(removed);
    }
    if (added.length > 0) {
      await productService.addImageToVariant(added);
    }

    logger.info(
      `[Sanity Variant Media] Synchronized ${desired.length} image link(s) for product ${product.id}.`,
    );

    const result = {
      linkedImages: desired.length,
      addedImages: added.length,
      removedImages: removed.length,
    };
    return new StepResponse(result, { added, removed });
  },
  async (compensation, { container }) => {
    if (!compensation) return;
    const productService = container.resolve<IProductModuleService>(
      Modules.PRODUCT,
    );
    if (compensation.added.length > 0) {
      await productService.removeImageFromVariant(compensation.added);
    }
    if (compensation.removed.length > 0) {
      await productService.addImageToVariant(compensation.removed);
    }
  },
);
