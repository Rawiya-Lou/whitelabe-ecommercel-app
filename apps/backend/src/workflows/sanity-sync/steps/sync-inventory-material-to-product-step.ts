import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import {
  IInventoryService,
  IProductModuleService,
} from "@medusajs/framework/types";

interface SyncInventoryMaterialInput {
  inventoryItemId: string;
}

interface ProductMaterialSnapshot {
  id: string;
  material: string | null;
  metadata: Record<string, unknown> | null;
}

const normalizeMaterial = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const syncInventoryMaterialToProductStep = createStep(
  "sync-inventory-material-to-product",
  async (
    { inventoryItemId }: SyncInventoryMaterialInput,
    { container },
  ): Promise<StepResponse<{ updatedProducts: number }, ProductMaterialSnapshot[]>> => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const inventoryService = container.resolve<IInventoryService>(
      Modules.INVENTORY,
    );
    const productService = container.resolve<IProductModuleService>(
      Modules.PRODUCT,
    );
    const [inventoryItem] = await inventoryService.listInventoryItems({
      id: [inventoryItemId],
    });
    if (!inventoryItem) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Cannot synchronize material for missing inventory item "${inventoryItemId}".`,
      );
    }

    const { data: links } = await query.graph({
      entity: "product_variant_inventory_item",
      fields: ["variant_id"],
      filters: { inventory_item_id: [inventoryItemId] },
    });
    const variantIds = [
      ...new Set(
        (links ?? [])
          .map((link) => link.variant_id)
          .filter((id): id is string => typeof id === "string" && !!id),
      ),
    ];
    if (variantIds.length === 0) {
      return new StepResponse({ updatedProducts: 0 }, []);
    }

    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: ["id", "product.id"],
      filters: { id: variantIds },
    });
    const productIds = [
      ...new Set(
        (variants ?? [])
          .map((variant) => variant.product?.id)
          .filter((id): id is string => typeof id === "string" && !!id),
      ),
    ];
    if (productIds.length === 0) {
      return new StepResponse({ updatedProducts: 0 }, []);
    }

    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "material", "metadata"],
      filters: { id: productIds },
    });
    const material = normalizeMaterial(inventoryItem.material);
    const updates: Array<{
      id: string;
      material: string | null;
      metadata: Record<string, unknown>;
    }> = [];
    const snapshots: ProductMaterialSnapshot[] = [];

    for (const product of products ?? []) {
      const metadata = isRecord(product.metadata) ? product.metadata : {};
      const translations = isRecord(metadata.translations)
        ? metadata.translations
        : {};
      const englishTranslation = isRecord(translations.en)
        ? translations.en
        : {};
      const currentMaterial = normalizeMaterial(product.material);
      const currentEnglishMaterial = normalizeMaterial(
        englishTranslation.material,
      );
      if (
        currentMaterial === material &&
        currentEnglishMaterial === material
      ) {
        continue;
      }

      updates.push({
        id: product.id,
        material,
        metadata: {
          ...metadata,
          translations: {
            ...translations,
            en: {
              ...englishTranslation,
              material: material ?? "",
            },
          },
        },
      });
      snapshots.push({
        id: product.id,
        material: product.material ?? null,
        metadata: isRecord(product.metadata) ? product.metadata : null,
      });
    }

    const appliedSnapshots: ProductMaterialSnapshot[] = [];
    try {
      for (const update of updates) {
        await productService.updateProducts(update.id, {
          material: update.material,
          metadata: update.metadata,
        });
        const snapshot = snapshots.find(({ id }) => id === update.id);
        if (snapshot) appliedSnapshots.push(snapshot);
      }
    } catch (error) {
      try {
        for (const snapshot of appliedSnapshots.reverse()) {
          await productService.updateProducts(snapshot.id, {
            material: snapshot.material,
            metadata: snapshot.metadata,
          });
        }
      } catch (compensationError) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Product material sync failed and its partial updates could not be fully compensated.",
        );
      }
      throw error;
    }

    return new StepResponse({ updatedProducts: updates.length }, snapshots);
  },
  async (snapshots, { container }) => {
    if (!snapshots?.length) return;
    const productService = container.resolve<IProductModuleService>(
      Modules.PRODUCT,
    );
    for (const { id, material, metadata } of snapshots) {
      await productService.updateProducts(id, { material, metadata });
    }
  },
);
