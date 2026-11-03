import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { SANITY_MODULE } from "../../../modules/sanity-sync/index";
import SanityModuleService from "../../../modules/sanity-sync/service";
import { syncLock } from "../../../utils/sync-lock";

type SanityDocument = Record<string, unknown> & { _id: string };

export const deleteProductFromSanityStep = createStep(
  "delete-product-from-sanity",
  async (
    productId: string,
    { container },
  ): Promise<
    StepResponse<
      { success: boolean; deletedCount: number },
      { documents: SanityDocument[] }
    >
  > => {
    const sanityService = container.resolve<SanityModuleService>(SANITY_MODULE);
    const matchingDocs = (await sanityService.query(
      `*[_type == "product" && (medusaId == $id || _id == $id || _id == "drafts." + $id || slug.current == $id)]`,
      { id: productId },
    )) as SanityDocument[];

    if (!matchingDocs?.length) {
      return new StepResponse({ success: true, deletedCount: 0 });
    }

    for (const document of matchingDocs) {
      await syncLock.mark(`medusa-sync:${document._id}`, "medusa", 120);
    }
    await sanityService.mutate(
      matchingDocs.map((document) => ({ delete: { id: document._id } })),
    );

    return new StepResponse(
      { success: true, deletedCount: matchingDocs.length },
      { documents: matchingDocs },
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
