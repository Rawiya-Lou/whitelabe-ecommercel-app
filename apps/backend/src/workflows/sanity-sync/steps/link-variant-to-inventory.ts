import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import {
  IInventoryService,
  IProductModuleService,
  Logger,
} from "@medusajs/framework/types";

interface LinkVariantInventoryInput {
  variantId: string;
  inventoryItemId: string;
  stockLocationId?: string;
  stockedQuantity?: number;
  shouldLink?: boolean;
  sku: string;
}

interface LinkVariantInventoryCompensation {
  variantId: string;
  inventoryItemId: string;
  stockLocationId?: string;
  levelCreatedByThisStep: boolean;
}

export const linkVariantToInventoryStep = createStep(
  "link-variant-to-inventory",
  async (
    input: LinkVariantInventoryInput,
    { container },
  ): Promise<
    StepResponse<{ success: boolean }, LinkVariantInventoryCompensation>
  > => {
    const remoteLink = container.resolve(ContainerRegistrationKeys.LINK);
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const productModuleService = container.resolve(
      Modules.PRODUCT,
    ) as IProductModuleService;
    const inventoryModuleService = container.resolve(
      Modules.INVENTORY,
    ) as IInventoryService;
    const logger = container.resolve(
      ContainerRegistrationKeys.LOGGER,
    ) as Logger;

    let targetVariantId = input.variantId;

    // Recovery Pass: If variantId is blank (from a fresh creation flow), look it up dynamically via current handle slug
    if (!targetVariantId && input.sku) {
      const productHandle = input.sku.replace("SANITY-", "").toLowerCase();
      const { data: variants } = await query.graph({
        entity: "product_variant",
        fields: ["id", "sku"],
        filters: { product: { handle: [productHandle] } },
      });

      if (variants && variants.length > 0) {
        targetVariantId = variants[0].id;
      }
    }

    if (!targetVariantId) {
      throw new MedusaError(
        MedusaError.Types.DB_ERROR,
        `[Sanity Sync] Linkage aborted: Unable to resolve a matching variant resource row target.`,
      );
    }

    // Inject the SKU Directly: Split explicitly across two positional arguments as required by Medusa v2 [INDEX]
    logger.info(
      `[Sanity Sync] Attaching SKU [${input.sku}] onto variant ID: [${targetVariantId}]`,
    );
    await productModuleService.updateProductVariants(targetVariantId, {
      sku: input.sku,
    });

    // Remote Link Binding Pass: Verify if connection maps already exist
    const { data: activeLinks } = await query.graph({
      entity: "product_variant_inventory_item",
      fields: ["variant_id", "inventory_item_id"],
      filters: {
        variant_id: [targetVariantId],
        inventory_item_id: [input.inventoryItemId],
      },
    });

    if (!activeLinks || activeLinks.length === 0) {
      logger.info(
        `[Sanity Sync] Binding Variant [${targetVariantId}] to Inventory Item [${input.inventoryItemId}]`,
      );
      await remoteLink.create([
        {
          [Modules.PRODUCT]: { variant_id: targetVariantId },
          [Modules.INVENTORY]: { inventory_item_id: input.inventoryItemId },
        },
      ]);
    }

    let levelCreatedByThisStep = false;

    if (input.stockLocationId) {
      const [existingLevel] = await inventoryModuleService.listInventoryLevels({
        inventory_item_id: [input.inventoryItemId],
        location_id: [input.stockLocationId],
      });

      if (!existingLevel) {
        logger.info(
          `[Sanity Sync] Initializing fresh stock level under Location: [${input.stockLocationId}]`,
        );
        await inventoryModuleService.createInventoryLevels([
          {
            inventory_item_id: input.inventoryItemId,
            location_id: input.stockLocationId,
            stocked_quantity: input.stockedQuantity ?? 0,
          },
        ]);
        levelCreatedByThisStep = true;
      } else {
        logger.info(
          `[Sanity Sync] Inventory level already exists for Item [${input.inventoryItemId}] at Location [${input.stockLocationId}]. Syncing quantities instead.`,
        );
        await inventoryModuleService.updateInventoryLevels([
          {
            inventory_item_id: input.inventoryItemId,
            location_id: input.stockLocationId,
            stocked_quantity: input.stockedQuantity ?? 0,
          },
        ]);
      }
    }

    return new StepResponse(
      { success: true },
      {
        variantId: targetVariantId,
        inventoryItemId: input.inventoryItemId,
        stockLocationId: input.stockLocationId,
        levelCreatedByThisStep,
      },
    );
  },

  async (compensateInput, { container }) => {
    if (!compensateInput) return;

    const remoteLink = container.resolve(ContainerRegistrationKeys.LINK);
    const inventoryModuleService = container.resolve(
      Modules.INVENTORY,
    ) as IInventoryService;
    const logger = container.resolve(
      ContainerRegistrationKeys.LOGGER,
    ) as Logger;

    logger.warn(
      `[Workflow Rollback] Downstream fault detected. Reversing inventory relationship bindings.`,
    );

    if (
      compensateInput.stockLocationId &&
      compensateInput.levelCreatedByThisStep
    ) {
      try {
        await inventoryModuleService.deleteInventoryLevel(
          compensateInput.inventoryItemId,
          compensateInput.stockLocationId,
        );
      } catch (error) {
        logger.error(
          `[Workflow Rollback] Safe level deletion skip or fail: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    await remoteLink.dismiss([
      {
        [Modules.PRODUCT]: { variant_id: compensateInput.variantId },
        [Modules.INVENTORY]: {
          inventory_item_id: compensateInput.inventoryItemId,
        },
      },
    ]);

    logger.info(`[Workflow Rollback] Symmetrical linkage breakdown complete.`);
  },
);
