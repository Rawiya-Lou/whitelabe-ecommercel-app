import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import { IInventoryService } from "@medusajs/framework/types";

interface SyncProductMaterialInput {
  productId: string;
}

interface InventoryMaterialSnapshot {
  id: string;
  material: string | null;
}

const normalizeMaterial = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export const syncProductMaterialToInventoryStep = createStep(
  "sync-product-material-to-inventory",
  async (
    { productId }: SyncProductMaterialInput,
    { container },
  ): Promise<StepResponse<{ updatedItems: number }, InventoryMaterialSnapshot[]>> => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const inventoryService = container.resolve<IInventoryService>(
      Modules.INVENTORY,
    );
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "material", "metadata", "variants.sku"],
      filters: { id: productId },
    });
    const product = products?.[0];
    if (!product) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Cannot synchronize material for missing product "${productId}".`,
      );
    }

    const metadata = product.metadata as Record<string, unknown> | null;
    const translations = metadata?.translations as
      | Record<string, Record<string, unknown>>
      | undefined;
    const material =
      normalizeMaterial(product.material) ??
      normalizeMaterial(translations?.en?.material);
    const skus = [
      ...new Set(
        (product.variants ?? [])
          .map((variant) => variant.sku)
          .filter((sku): sku is string => typeof sku === "string" && !!sku),
      ),
    ];
    const updatedItems: InventoryMaterialSnapshot[] = [];

    for (const sku of skus) {
      const inventoryItems = await inventoryService.listInventoryItems({
        sku: [sku],
      });
      for (const inventoryItem of inventoryItems) {
        if (normalizeMaterial(inventoryItem.material) === material) continue;
        await inventoryService.updateInventoryItems({
          id: inventoryItem.id,
          material,
        });
        updatedItems.push({
          id: inventoryItem.id,
          material: inventoryItem.material ?? null,
        });
      }
    }

    return new StepResponse(
      { updatedItems: updatedItems.length },
      updatedItems,
    );
  },
  async (snapshot, { container }) => {
    if (!snapshot?.length) return;
    const inventoryService = container.resolve<IInventoryService>(
      Modules.INVENTORY,
    );
    await inventoryService.updateInventoryItems(
      snapshot.map(({ id, material }) => ({ id, material })),
    );
  },
);
