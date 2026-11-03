import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { SANITY_MODULE } from "../../../modules/sanity-sync/index";
import SanityModuleService from "../../../modules/sanity-sync/service";
import { syncLock } from "../../../utils/sync-lock";

type SanityCategoryDocument = Record<string, unknown> & { _id: string };

export const deleteCategoryFromSanityStep = createStep(
  "delete-category-from-sanity",
  async (
    categoryId: string,
    { container },
  ): Promise<
    StepResponse<
      { success: boolean; deletedCount: number },
      { documents: SanityCategoryDocument[] }
    >
  > => {
    const sanityService = container.resolve<SanityModuleService>(SANITY_MODULE);
    const documents = (await sanityService.query(
      '*[_type == "category" && (medusaId == $id || _id == $id)]',
      { id: categoryId },
    )) as SanityCategoryDocument[];
    if (!documents?.length) {
      return new StepResponse({ success: true, deletedCount: 0 });
    }

    for (const document of documents) {
      await syncLock.mark(`medusa-sync:${document._id}`, "medusa", 120);
    }
    await sanityService.mutate(
      documents.map((document) => ({ delete: { id: document._id } })),
    );
    return new StepResponse(
      { success: true, deletedCount: documents.length },
      { documents },
    );
  },
  async (compensation, { container }) => {
    if (!compensation?.documents.length) return;
    const sanityService = container.resolve<SanityModuleService>(SANITY_MODULE);
    await sanityService.mutate(
      compensation.documents.map((document) => ({
        createOrReplace: document,
      })),
    );
  },
);
