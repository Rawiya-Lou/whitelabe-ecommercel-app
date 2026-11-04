import { randomUUID } from "node:crypto";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/framework/types";
import { SANITY_MODULE } from "../../../modules/sanity-sync/index";
import SanityModuleService from "../../../modules/sanity-sync/service";
import { syncLock } from "../../../utils/sync-lock";

type SanityCategoryDocument = Record<string, unknown> & { _id: string };
type CategorySnapshot = {
  sanityId: string;
  document: SanityCategoryDocument | null;
};

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const syncCategoryToSanityStep = createStep(
  "sync-category-to-sanity",
  async (
    categoryId: string,
    { container },
  ): Promise<StepResponse<Record<string, unknown>, CategorySnapshot>> => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
    const sanityService = container.resolve<SanityModuleService>(SANITY_MODULE);
    const { data: categories } = await query.graph({
      entity: "product_category",
      fields: [
        "id",
        "name",
        "handle",
        "description",
        "metadata",
        "category_children.id",
        "category_children.metadata",
      ],
      filters: { id: [categoryId] },
    });
    const category = categories?.[0];
    if (!category) {
      logger.error(
        `[Sanity Category Sync] Medusa category ${categoryId} was not found during outbound synchronization.`,
      );
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Cannot synchronize missing Medusa category "${categoryId}" to Sanity.`,
      );
    }

    const metadata = isRecord(category.metadata) ? category.metadata : {};
    const sanityId =
      typeof metadata.sanity_id === "string" && metadata.sanity_id
        ? metadata.sanity_id
        : category.id;
    const { projectId, dataset } = sanityService.clientConfig;
    const correlationId = randomUUID();
    logger.info(
      `[Sanity Category Sync] Preparing category ${categoryId} for Sanity document ${sanityId}; project=${projectId}, dataset=${dataset}, metadataSanityId=${typeof metadata.sanity_id === "string" ? metadata.sanity_id : "missing"}.`,
    );
    const previousDocument = await sanityService.query(
      '*[_id == $id][0]',
      { id: sanityId },
    );
    const document = isRecord(previousDocument)
      ? (previousDocument as SanityCategoryDocument)
      : null;
    const children = (category.category_children || []).map(
      (child: any) => ({
        _type: "reference",
        _ref: child.metadata?.sanity_id || child.id,
        _key: `category_${child.id}`,
        _weak: true,
      }),
    );
    const currentTitle = isRecord(document?.title) ? document.title : {};
    const currentDescription = isRecord(document?.description)
      ? document.description
      : {};
    const title = {
      _type: "localizedString",
      en: category.name ?? "",
      fr: currentTitle.fr ?? "",
      ar: currentTitle.ar ?? "",
    };
    const description = {
      _type: "localizedText",
      en: category.description ?? "",
      fr: currentDescription.fr ?? "",
      ar: currentDescription.ar ?? "",
    };
    const patchSet = {
      slug: { _type: "slug", current: category.handle },
      medusaId: category.id,
      updatedBy: "medusa",
      syncOrigin: "medusa",
      correlationId,
      title,
      description,
      subCategories: children,
    };

    await syncLock.mark(`sanity-echo:${sanityId}`, correlationId, 30);
    await syncLock.mark(`medusa-sync:${sanityId}`, correlationId, 120);
    await syncLock.mark(`medusa-sync:${category.id}`, correlationId, 120);
    try {
      const mutationResult = await sanityService.mutate([
        {
          createIfNotExists: {
            _id: sanityId,
            _type: "category",
          },
        },
        { patch: { id: sanityId, set: patchSet } },
      ]);
      const resultRecord = isRecord(mutationResult) ? mutationResult : {};
      logger.info(
        `[Sanity Category Sync] Sanity mutation succeeded for Medusa category ${categoryId}; document=${sanityId}, project=${projectId}, dataset=${dataset}, transactionId=${String(resultRecord.transactionId ?? "unknown")}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        `[Sanity Category Sync] Sanity mutation failed for Medusa category ${categoryId}; document=${sanityId}, project=${projectId}, dataset=${dataset}: ${message}`,
      );
      try {
        await syncLock.consume(`sanity-echo:${sanityId}`);
      } catch (cleanupError) {
        const cleanupMessage =
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError);
        logger.warn(
          `[Sanity Category Sync] Failed to clear Sanity echo marker for ${sanityId}: ${cleanupMessage}`,
        );
      }
      throw error;
    }

    return new StepResponse(
      { success: true, categoryId, correlationId },
      { sanityId, document },
    );
  },
  async (snapshot, { container }) => {
    if (!snapshot) return;
    const sanityService = container.resolve<SanityModuleService>(SANITY_MODULE);
    if (!snapshot.document) {
      await sanityService.mutate([{ delete: { id: snapshot.sanityId } }]);
      return;
    }
    const restoreFields = Object.fromEntries(
      Object.entries(snapshot.document).filter(
        ([key]) =>
          !["_id", "_rev", "_type", "_createdAt", "_updatedAt"].includes(key),
      ),
    );
    await sanityService.mutate([
      { patch: { id: snapshot.sanityId, set: restoreFields } },
    ]);
  },
);
