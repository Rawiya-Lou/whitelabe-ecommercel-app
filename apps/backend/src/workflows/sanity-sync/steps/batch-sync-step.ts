import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  IProductModuleService,
  IInventoryService,
  Logger,
} from "@medusajs/framework/types";
import { SanityMedusaSyncService } from "../utils/batch-service";
import { SanityProductPayload, SystemDefaultsDTO } from "../types";

interface BatchSyncStepInput {
  products: SanityProductPayload[];
  categoryIds: string[];
  systemDefaults: SystemDefaultsDTO;
}

export const batchSyncStep = createStep(
  "batch-sync",
  async (input: BatchSyncStepInput, { container }) => {
    // Resolve Medusa framework layers from runtime container
    const productModuleService = container.resolve(
      Modules.PRODUCT,
    ) as IProductModuleService;
    const inventoryModuleService = container.resolve(
      Modules.INVENTORY,
    ) as IInventoryService;
    const remoteLinkService = container.resolve(ContainerRegistrationKeys.LINK);
    const logger = container.resolve(
      ContainerRegistrationKeys.LOGGER,
    ) as Logger;

    // Instantiate using the layout expected by your SanityMedusaSyncService constructor
    const batchService = new SanityMedusaSyncService({
      [Modules.PRODUCT]: productModuleService,
      [Modules.INVENTORY]: inventoryModuleService,
      remoteLink: remoteLinkService,
      [ContainerRegistrationKeys.LOGGER]: logger,
    });

    logger.info(
      `[Sanity Sync DAG] Initializing processing lane for ${input.products.length} catalog items.`,
    );

    // Delegate execution directly to the pipeline runner matrix
    const resultMetrics = await batchService.batchSyncProducts(
      input.products,
      {
        categoryIds: input.categoryIds,
        shippingProfileId: input.systemDefaults.shippingProfileId,
        salesChannelId: input.systemDefaults.salesChannelId,
        stockLocationId: input.systemDefaults.stockLocationId,
      },
      25, // Controlled execution batch sizing
    );

    logger.info(
      `[Sanity Sync DAG] Batch process completed. Created: ${resultMetrics.created}, Inventory Links Linked: ${resultMetrics.inventoryLinked}, Failures: ${resultMetrics.failures.length}`,
    );

    return new StepResponse(resultMetrics);
  },
);
