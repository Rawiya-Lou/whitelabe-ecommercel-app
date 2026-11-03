import { randomUUID } from "node:crypto";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
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
      return new StepResponse({ skipped: true, reason: "not_found" });
    }

    const metadata = isRecord(category.metadata) ? category.metadata : {};
    const sanityId =
      typeof metadata.sanity_id === "string" && metadata.sanity_id
        ? metadata.sanity_id
        : category.id;
    const correlationId = randomUUID();
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
      await sanityService.mutate([
        {
          createIfNotExists: {
            _id: sanityId,
            _type: "category",
          },
        },
        { patch: { id: sanityId, set: patchSet } },
      ]);
    } catch (error) {
      await syncLock.consume(`sanity-echo:${sanityId}`);
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
