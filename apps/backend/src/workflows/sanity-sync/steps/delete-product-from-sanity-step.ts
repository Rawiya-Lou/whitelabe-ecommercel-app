import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { SANITY_MODULE } from "../../../modules/sanity-sync/index";
import SanityModuleService from "../../../modules/sanity-sync/service";
import { syncLock } from "../../../utils/sync-lock";


export const deleteProductFromSanityStep = createStep(
  "delete-product-from-sanity",
  async (productId: string, { container }) => {
    const sanityService = container.resolve<SanityModuleService>(SANITY_MODULE);

    const matchingDocs = await sanityService.query(
      `*[_type == "product" && (medusaId == $id || _id == $id || _id == "drafts." + $id || slug.current == $id)]{ _id }`,
      { id: productId }
    );

    if (matchingDocs?.length) {
      await syncLock.acquire(`medusa-sync:${productId}`, 20);
      await sanityService.mutate(
        matchingDocs.map((doc: any) => ({ delete: { id: doc._id } }))
      );
    }

    return new StepResponse({ success: true, deletedCount: matchingDocs?.length || 0 });
  }
);