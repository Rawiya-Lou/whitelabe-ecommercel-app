import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import {
  IProductModuleService,
  IInventoryService,
  Logger,
} from "@medusajs/framework/types";

interface DeleteCatalogItemInput {
  slug: string;
  type: "product" | "category";
}

interface DeleteCatalogItemResult {
  deleted: boolean;
  id?: string;
}

export const deleteCatalogItemStep = createStep(
  "delete-catalog-item",
  async (input: DeleteCatalogItemInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const productModuleService = container.resolve(
      Modules.PRODUCT,
    ) as IProductModuleService;
    const inventoryModuleService = container.resolve(
      Modules.INVENTORY,
    ) as IInventoryService;
    const remoteLink = container.resolve(ContainerRegistrationKeys.LINK);
    const logger = container.resolve(
      ContainerRegistrationKeys.LOGGER,
    ) as Logger;

    const normalizedSlug = input.slug.toLowerCase().trim();

    if (input.type === "category") {
      logger.info(
        `[Sanity Sync] Inspecting delete constraints for product category: [${normalizedSlug}]`,
      );

    
      const { data: categories } = await query.graph({
        entity: "product_category",
        fields: ["id", "handle", "products.id"],
        filters: { handle: [normalizedSlug] },
      });

      const targetCategory = categories?.[0];

      if (!targetCategory) {
        logger.warn(
          `Deletion pass skipped: Category with handle [${normalizedSlug}] does not exist.`,
        );
        return new StepResponse<DeleteCatalogItemResult>({ deleted: false });
      }

      // 2. Prevent deletion if active products remain mapped to this category
      if (targetCategory.products && targetCategory.products.length > 0) {
        const errorMsg = `Aborting category deletion: Category [${normalizedSlug}] has ${targetCategory.products.length} products associated with it.`;
        logger.error(`${errorMsg}`);
        throw new MedusaError(MedusaError.Types.NOT_ALLOWED, errorMsg);
      }

      // 3. Complete structural category deletion safely
      await productModuleService.deleteProductCategories([targetCategory.id]);
      logger.info(`Category [${normalizedSlug}] successfully dropped.`);

      return new StepResponse<DeleteCatalogItemResult>({
        deleted: true,
        id: targetCategory.id,
      });
    }

    logger.info(
      `[Sanity Sync] Inspecting delete constraints for product: [${normalizedSlug}]`,
    );

    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "variants.id", "variants.sku"],
      filters: { handle: [normalizedSlug] },
    });

    const targetProduct = products?.[0];

    if (!targetProduct) {
      logger.warn(
        `Deletion pass skipped: Product with handle [${normalizedSlug}] does not exist.`,
      );
      return new StepResponse<DeleteCatalogItemResult>({ deleted: false });
    }

    const variantId = targetProduct.variants?.[0]?.id;
    const variantSku = targetProduct.variants?.[0]?.sku;

    // Clear out Cross-Module Relationship Indexes safely via Remote Links
    if (variantId && variantSku) {
      const [inventoryItem] = await inventoryModuleService.listInventoryItems({
        sku: [variantSku],
      });

      if (inventoryItem) {
        logger.info(
          `Severing cross-module remote link for SKU: [${variantSku}]`,
        );
        await remoteLink.dismiss({
          [Modules.PRODUCT]: { variant_id: variantId },
          [Modules.INVENTORY]: { inventory_item_id: inventoryItem.id },
        });

        logger.info(
          `Purging orphaned inventory records item row ID: [${inventoryItem.id}]`,
        );
        await inventoryModuleService.deleteInventoryItems([inventoryItem.id]);
      }
    }

    // Perform a safe deletion drop pass on the base product entity record
    await productModuleService.deleteProducts([targetProduct.id]);
    logger.info(
      `Deletion Cascade complete for product handle: [${normalizedSlug}]`,
    );

    return new StepResponse<DeleteCatalogItemResult>({
      deleted: true,
      id: targetProduct.id,
    });
  },
);
