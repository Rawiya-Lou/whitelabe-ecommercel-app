import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils";
import { IProductModuleService } from "@medusajs/framework/types";

export interface SyncCategoryInput {
  sanityId: string;
  name: string;
  handle: string;
  description: string;
  metadata: Record<string, unknown>;
}

interface CategorySnapshot {
  id: string;
  created: boolean;
  previous?: {
    name: string;
    handle: string;
    description?: string;
    is_active: boolean;
    metadata?: Record<string, unknown> | null;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const syncCategoryFromSanityStep = createStep(
  "sync-category-from-sanity",
  async (
    input: SyncCategoryInput,
    { container },
  ): Promise<StepResponse<{ id: string; created: boolean }, CategorySnapshot>> => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const productModuleService = container.resolve(
      Modules.PRODUCT,
    ) as IProductModuleService;
    const { data: bySanityId } = await query.graph({
      entity: "product_category",
      fields: ["id", "name", "handle", "description", "is_active", "metadata"],
      filters: {
        metadata: { sanity_id: input.sanityId },
      } as Record<string, unknown>,
    });
    const existing =
      bySanityId?.[0] ??
      (
        await productModuleService.listProductCategories({
          handle: [input.handle],
        })
      )?.[0];

    if (!existing) {
      const [created] = await productModuleService.createProductCategories([
        {
          name: input.name,
          handle: input.handle,
          description: input.description,
          is_active: true,
          metadata: {
            ...input.metadata,
            sanity_id: input.sanityId,
            is_sync_origin: "sanity",
          },
        },
      ]);
      return new StepResponse(
        { id: created.id, created: true },
        { id: created.id, created: true },
      );
    }

    const existingMetadata = isRecord(existing.metadata)
      ? existing.metadata
      : {};
    const existingTranslations = isRecord(existingMetadata.translations)
      ? existingMetadata.translations
      : {};
    const incomingTranslations = isRecord(input.metadata.translations)
      ? input.metadata.translations
      : {};
    const mergeLocale = (locale: string) => ({
      ...(isRecord(existingTranslations[locale])
        ? existingTranslations[locale]
        : {}),
      ...(isRecord(incomingTranslations[locale])
        ? incomingTranslations[locale]
        : {}),
    });

    await productModuleService.updateProductCategories(existing.id, {
      name: input.name,
      handle: input.handle,
      description: input.description,
      is_active: true,
      metadata: {
        ...existingMetadata,
        ...input.metadata,
        translations: {
          ...existingTranslations,
          ...incomingTranslations,
          en: mergeLocale("en"),
          fr: mergeLocale("fr"),
          ar: mergeLocale("ar"),
        },
        sanity_id: input.sanityId,
        is_sync_origin: "sanity",
      },
    });

    return new StepResponse(
      { id: existing.id, created: false },
      {
        id: existing.id,
        created: false,
        previous: {
          name: existing.name,
          handle: existing.handle,
          description: existing.description ?? undefined,
          is_active: existing.is_active,
          metadata: existing.metadata as Record<string, unknown> | null,
        },
      },
    );
  },
  async (snapshot, { container }) => {
    if (!snapshot) return;
    const productModuleService = container.resolve(
      Modules.PRODUCT,
    ) as IProductModuleService;
    if (snapshot.created) {
      await productModuleService.deleteProductCategories([snapshot.id]);
      return;
    }
    if (snapshot.previous) {
      await productModuleService.updateProductCategories(snapshot.id, {
        ...snapshot.previous,
      });
    }
  },
);
