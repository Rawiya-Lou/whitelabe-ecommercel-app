import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { IInventoryService, Logger } from "@medusajs/framework/types";
import { ProductInspectionDTO } from "../types";

interface InspectInput {
  productSlug: string;
  variantSku: string;
}

export const inspectExistingProductStep = createStep(
  "inspect-existing-product",
  async (
    input: InspectInput,
    { container },
  ): Promise<StepResponse<ProductInspectionDTO>> => {
    const logger = container.resolve(
      ContainerRegistrationKeys.LOGGER,
    ) as Logger;
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const inventoryModuleService = container.resolve(
      Modules.INVENTORY,
    ) as IInventoryService;

    const normalizedSlug = input.productSlug.toLowerCase().trim();
    const normalizedSku = input.variantSku.trim();

    let productId: string | undefined;
    let variantId: string | undefined;
    let productExists = false;

    // Core Lookup Pass: Query Graph engine by handle slug
    const { data: productsBySlug } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "handle",
        "title",
        "subtitle",
        "description",
        "origin_country",
        "metadata",
        "variants.id",
        "variants.sku",
        "variants.origin_country",
        "variants.metadata",
        "variants.options.value",
        "variants.options.option.title",
        "variants.images.id",
        "variants.images.url",
        "images.id",
        "images.url",
      ],
      filters: { handle: [normalizedSlug] },
    });

    let existingProduct:
      | {
          title?: string;
          subtitle?: string | null;
          description?: string;
          originCountry?: string | null;
          metadata?: Record<string, unknown> | null;
          variantImageLinks?: Array<{
            variantId: string;
            imageIds: string[];
          }>;
          variants?: ProductInspectionDTO["variants"];
        }
      | undefined;

    if (productsBySlug && productsBySlug.length > 0) {
      const product = productsBySlug[0];
      productExists = true;
      productId = product.id;
      variantId = product.variants?.[0]?.id;
      existingProduct = {
        title: product.title ?? undefined,
        subtitle: product.subtitle,
        description: product.description ?? undefined,
        originCountry: product.origin_country,
        metadata: product.metadata as Record<string, unknown> | null,
        variantImageLinks: (product.variants ?? []).map((variant: any) => {
          const variantImages = Array.isArray(variant.metadata?.variant_images)
            ? variant.metadata.variant_images
            : [];
          const imageUrls = new Set(
            variantImages.flatMap((image: any) =>
              typeof image?.url === "string" ? [image.url] : [],
            ),
          );
          return {
            variantId: variant.id,
            imageIds: (product.images ?? [])
              .filter((image: any) => imageUrls.has(image.url))
              .map((image: any) => image.id),
          };
        }),
        variants: product.variants ?? [],
      };
    }

    // Orphan Protection Pass: If not found by slug, search directly by Variant SKU
    if (!productExists && normalizedSku) {
      const { data: variantsBySku } = await query.graph({
        entity: "product_variant",
        fields: [
          "id",
          "sku",
          "product.id",
          "product.title",
          "product.subtitle",
          "product.description",
          "product.origin_country",
          "product.metadata",
        ],
        filters: { sku: [normalizedSku] },
      });

      if (variantsBySku && variantsBySku.length > 0) {
        const foundVariant = variantsBySku[0];
        variantId = foundVariant.id;
        productId = foundVariant.product?.id;
        productExists = !!productId; // Becomes an update if a parent product is linked
        const foundProduct = foundVariant.product;
        existingProduct = foundProduct
          ? {
              title: foundProduct.title ?? undefined,
              subtitle: foundProduct.subtitle,
              description: foundProduct.description ?? undefined,
              originCountry: foundProduct.origin_country,
              metadata: foundProduct.metadata as
                | Record<string, unknown>
                | null,
            }
          : undefined;

        logger.info(
          `[Sanity Sync Guard] Orphaned variant detected for SKU [${normalizedSku}]. Safely healing database reference routing map.`,
        );
      }
    }

    // Resolve Inventory ledger tracking item independently
    const [inventoryItem] = normalizedSku
      ? await inventoryModuleService.listInventoryItems({
          sku: [normalizedSku],
        })
      : [];

    logger.info(
      `[Sanity Sync] Inspection Matrix for [${normalizedSlug}]: Product Exists = ${productExists} | Inventory Item Exists = ${!!inventoryItem}`,
    );

    return new StepResponse({
      productExists,
      productId,
      inventoryItemId: inventoryItem?.id,
      variantId,
      title: existingProduct?.title,
      subtitle: existingProduct?.subtitle,
      description: existingProduct?.description,
      originCountry: existingProduct?.originCountry,
      metadata: existingProduct?.metadata,
      variantImageLinks: existingProduct?.variantImageLinks,
      variants: existingProduct?.variants,
    });
  },
);
