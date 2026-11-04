import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type { Logger } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import SanityModuleService from "../../../modules/sanity-sync/service";
import { SANITY_MODULE } from "../../../modules/sanity-sync";
import { syncProductToSanityWorkflow } from "../../../workflows/sanity-sync/forward-sync-workflows";
import { syncCategoryToSanityWorkflow } from "../../../workflows/sanity-sync/category-forward-workflow";

type SyncRequestBody = {
  entity?: unknown;
  id?: unknown;
};

export async function POST(
  req: AuthenticatedMedusaRequest<SyncRequestBody>,
  res: MedusaResponse,
): Promise<void> {
  const { entity, id } = req.body;
  if (
    (entity !== "product" && entity !== "category") ||
    typeof id !== "string" ||
    !id.trim()
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      'Expected { "entity": "product" | "category", "id": string }.',
    );
  }

  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const sanityService = req.scope.resolve<SanityModuleService>(SANITY_MODULE);
  const { projectId, dataset } = sanityService.clientConfig;
  logger.info(
    `[Sanity Sync Diagnostic] Starting sync for ${entity} ${id}; project=${projectId}, dataset=${dataset}.`,
  );

  try {
    if (entity === "category") {
      await syncCategoryToSanityWorkflow(req.scope).run({
        input: { categoryId: id },
      });
    } else {
      await syncProductToSanityWorkflow(req.scope).run({
        input: { productId: id },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      `[Sanity Sync Diagnostic] Sync failed for ${entity} ${id}; project=${projectId}, dataset=${dataset}: ${message}`,
    );
    throw error;
  }

  logger.info(
    `[Sanity Sync Diagnostic] Sync completed for ${entity} ${id}; project=${projectId}, dataset=${dataset}.`,
  );
  res.status(200).json({
    success: true,
    entity,
    id,
    operation: "sync",
    sanity: { projectId, dataset },
  });
}
