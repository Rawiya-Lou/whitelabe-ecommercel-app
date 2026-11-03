import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import { IInventoryService } from "@medusajs/framework/types";

interface EnsureProductInventoryInput {
  productHandle: string;
  stockLocationId: string;
}

interface InventoryCompensation {
  createdInventoryItemIds: string[];
  updatedItems: Array<{
    id: string;
    material: string | null;
    origin_country: string | null;
  }>;
  createdLinks: Array<{ variantId: string; inventoryItemId: string }>;
  createdLevels: Array<{ inventoryItemId: string; locationId: string }>;
}

interface WorkflowContainer {
  resolve(key: string): unknown;
}

interface RemoteLinkService {
  create(links: Array<Record<string, unknown>>): Promise<unknown>;
  dismiss(links: Array<Record<string, unknown>>): Promise<unknown>;
}

const rollbackInventory = async (
  compensation: InventoryCompensation,
  container: WorkflowContainer,
): Promise<void> => {
  const inventoryService = container.resolve(
    Modules.INVENTORY,
  ) as IInventoryService;
  const remoteLink = container.resolve(
    ContainerRegistrationKeys.LINK,
  ) as RemoteLinkService;

  for (const item of compensation.updatedItems.reverse()) {
    await inventoryService.updateInventoryItems({
      id: item.id,
      material: item.material,
      origin_country: item.origin_country,
    });
  }
  for (const level of compensation.createdLevels.reverse()) {
    await inventoryService.deleteInventoryLevel(
      level.inventoryItemId,
      level.locationId,
    );
  }
  for (const link of compensation.createdLinks.reverse()) {
    await remoteLink.dismiss([
      {
        [Modules.PRODUCT]: { variant_id: link.variantId },
        [Modules.INVENTORY]: { inventory_item_id: link.inventoryItemId },
      },
    ]);
  }
  if (compensation.createdInventoryItemIds.length > 0) {
    await inventoryService.deleteInventoryItems(
      compensation.createdInventoryItemIds,
    );
  }
};

export const ensureProductInventoryStep = createStep(
  "ensure-product-inventory",
  async (
    input: EnsureProductInventoryInput,
    { container },
  ): Promise<StepResponse<{ linkedVariants: number }, InventoryCompensation>> => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const inventoryService = container.resolve(
      Modules.INVENTORY,
    ) as IInventoryService;
    const remoteLink = container.resolve(
      ContainerRegistrationKeys.LINK,
    ) as RemoteLinkService;
    const compensation: InventoryCompensation = {
      createdInventoryItemIds: [],
      updatedItems: [],
      createdLinks: [],
      createdLevels: [],
    };

    try {
      const { data: products } = await query.graph({
        entity: "product",
        fields: [
          "id",
          "handle",
          "material",
          "origin_country",
          "metadata",
          "variants.id",
          "variants.sku",
        ],
        filters: { handle: [input.productHandle] },
      });
      const product = products?.[0];
      if (!product) {
        throw new MedusaError(
          MedusaError.Types.DB_ERROR,
          `Unable to find product ${input.productHandle} after synchronization.`,
        );
      }

      const metadata = product.metadata as
        | Record<string, unknown>
        | null
        | undefined;
      const translations = metadata?.translations as
        | Record<string, Record<string, unknown>>
        | undefined;
      const material =
        typeof product.material === "string" && product.material.trim()
          ? product.material.trim()
          : typeof translations?.en?.material === "string"
            ? translations.en.material.trim() || null
            : null;

      let linkedVariants = 0;
      for (const variant of product.variants ?? []) {
        if (!variant.id || !variant.sku) continue;

        let [inventoryItem] = await inventoryService.listInventoryItems({
          sku: [variant.sku],
        });
        if (!inventoryItem) {
          [inventoryItem] = await inventoryService.createInventoryItems([
            {
              sku: variant.sku,
              title: variant.sku,
              material,
              ...(typeof product.origin_country === "string" &&
              product.origin_country.toUpperCase() !== "DZ"
                ? { origin_country: product.origin_country }
                : {}),
              requires_shipping: true,
            },
          ]);
          if (!inventoryItem) {
            throw new MedusaError(
              MedusaError.Types.DB_ERROR,
              `Unable to provision inventory for variant SKU ${variant.sku}.`,
            );
          }
          compensation.createdInventoryItemIds.push(inventoryItem.id);
        } else {
          const itemUpdate: {
            material?: string | null;
            origin_country?: string | null;
          } = {};
          if ((inventoryItem.material ?? null) !== material) {
            itemUpdate.material = material;
          }
          if (
            typeof inventoryItem.origin_country === "string" &&
            inventoryItem.origin_country.toUpperCase() === "DZ"
          ) {
            itemUpdate.origin_country = null;
          }
          if (Object.keys(itemUpdate).length > 0) {
            await inventoryService.updateInventoryItems({
              id: inventoryItem.id,
              ...itemUpdate,
            });
            compensation.updatedItems.push({
              id: inventoryItem.id,
              material: inventoryItem.material ?? null,
              origin_country: inventoryItem.origin_country ?? null,
            });
          }
        }

        const { data: existingLinks } = await query.graph({
          entity: "product_variant_inventory_item",
          fields: ["variant_id", "inventory_item_id"],
          filters: {
            variant_id: [variant.id],
            inventory_item_id: [inventoryItem.id],
          },
        });
        if (!existingLinks?.length) {
          await remoteLink.create([
            {
              [Modules.PRODUCT]: { variant_id: variant.id },
              [Modules.INVENTORY]: { inventory_item_id: inventoryItem.id },
            },
          ]);
          compensation.createdLinks.push({
            variantId: variant.id,
            inventoryItemId: inventoryItem.id,
          });
        }

        if (!input.stockLocationId) continue;
        const [inventoryLevel] = await inventoryService.listInventoryLevels({
          inventory_item_id: [inventoryItem.id],
          location_id: [input.stockLocationId],
        });
        if (!inventoryLevel) {
          await inventoryService.createInventoryLevels([
            {
              inventory_item_id: inventoryItem.id,
              location_id: input.stockLocationId,
              stocked_quantity: 0,
            },
          ]);
          compensation.createdLevels.push({
            inventoryItemId: inventoryItem.id,
            locationId: input.stockLocationId,
          });
        }
        linkedVariants += 1;
      }

      return new StepResponse({ linkedVariants }, compensation);
    } catch (error) {
      await rollbackInventory(compensation, container);
      throw error;
    }
  },
  async (compensation, { container }) => {
    if (!compensation) return;
    await rollbackInventory(compensation, container);
  },
);
