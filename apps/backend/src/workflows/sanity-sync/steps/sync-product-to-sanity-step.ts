import { createHash, randomUUID } from "node:crypto";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { Logger } from "@medusajs/framework/types";
import { SANITY_MODULE } from "../../../modules/sanity-sync/index";
import SanityModuleService from "../../../modules/sanity-sync/service";
import { syncLock } from "../../../utils/sync-lock";
import {
  SanityLocalizedString,
} from "../types";

interface ProductSnapshot {
  sanityId: string;
  document: Record<string, unknown> | null;
}

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const safeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export const syncProductToSanityStep = createStep(
  "sync-product-to-sanity",
  async (
    productId: string,
    { container },
  ): Promise<StepResponse<Record<string, unknown>, ProductSnapshot>> => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
    const sanityService = container.resolve<SanityModuleService>(SANITY_MODULE);

    if (await syncLock.isLocked(`sanity-sync:${productId}`)) {
      return new StepResponse({ skipped: true, reason: "sync_in_progress" });
    }

    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "subtitle",
        "handle",
        "material",
        "origin_country",
        "tags.value",
        "description",
        "metadata",
        "variants.id",
        "variants.sku",
        "variants.title",
        "variants.metadata",
        "categories.id",
        "categories.metadata",
        "images.id",
        "images.url",
      ],
      filters: { id: productId },
    });

    const product = products?.[0];
    if (!product) {
      return new StepResponse({ skipped: true, reason: "not_found" });
    }

    const metadata = (product.metadata ?? {}) as Record<string, any>;
    const translations = (metadata.translations as Record<string, any>) || {};
    const sanityId = (metadata.sanity_id as string) || product.id;
    const correlationId = randomUUID();

    let previousDocument: unknown;
    try {
      previousDocument = await sanityService.query(
        '*[_id == $id][0]',
        { id: sanityId },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown Sanity query failure";
      logger.error(
        `[Sanity Product Sync] Could not read product ${sanityId}: ${message}`,
      );
      return new StepResponse({
        success: false,
        productId,
        reason: "sanity_unavailable",
      });
    }
    const document = isRecord(previousDocument) ? previousDocument : null;

    const localizedValue = (
      primary: unknown,
      translated: unknown,
      existing: unknown,
    ): string => {
      if (typeof primary === "string") return primary;
      if (typeof translated === "string") return translated;
      return safeText(existing);
    };
    const existingTitle = isRecord(document?.title) ? document.title : {};
    const existingDescription = isRecord(document?.description)
      ? document.description
      : {};
    const existingMaterial = isRecord(document?.material)
      ? document.material
      : {};
    const titleObj: SanityLocalizedString & { _type: string } = {
      _type: "localizedString",
      en: localizedValue(product.title, translations.en?.title, existingTitle.en),
      fr: localizedValue(
        product.subtitle,
        translations.fr?.title,
        existingTitle.fr,
      ),
      ar: localizedValue(undefined, translations.ar?.title, existingTitle.ar),
    };
    const descObj: SanityLocalizedString & { _type: string } = {
      _type: "localizedText",
      en: localizedValue(
        product.description,
        translations.en?.description,
        existingDescription.en,
      ),
      fr: localizedValue(
        undefined,
        translations.fr?.description,
        existingDescription.fr,
      ),
      ar: localizedValue(
        undefined,
        translations.ar?.description,
        existingDescription.ar,
      ),
    };
    const materialObj: SanityLocalizedString & { _type: string } = {
      _type: "localizedString",
      en: localizedValue(
        product.material,
        translations.en?.material,
        existingMaterial.en,
      ),
      fr: localizedValue(
        undefined,
        translations.fr?.material,
        existingMaterial.fr,
      ),
      ar: localizedValue(
        undefined,
        translations.ar?.material,
        existingMaterial.ar,
      ),
    };
    const categories = (product.categories || []).map((category: any) => ({
      _type: "reference",
      _ref: category.metadata?.sanity_id || category.id,
      _key: `cat_${category.id}`,
      _weak: true,
    }));

    const categoryReferences = (value: unknown): string[] =>
      Array.isArray(value)
        ? value
            .flatMap((category) =>
              isRecord(category) && typeof category._ref === "string"
                ? [category._ref]
                : [],
            )
            .sort()
        : [];
    const tagValues = Array.isArray(product.tags)
      ? product.tags
        .flatMap((tag: unknown) =>
          isRecord(tag) && typeof tag.value === "string"
            ? [tag.value.trim()]
            : [],
        )
        .filter(Boolean)
      : [];
    const existingTagValues = Array.isArray(document?.tags)
      ? document.tags.filter(
        (tag): tag is string => typeof tag === "string",
      )
      : [];
    const sameLocalizedValue = (current: unknown, desired: unknown) =>
      isRecord(current) &&
      isRecord(desired) &&
      ["en", "fr", "ar"].every(
        (language) => safeText(current[language]) === safeText(desired[language]),
      );
    const sameCommerceStructure =
      document?.medusaId === product.id &&
      sameLocalizedValue(document.title, titleObj) &&
      sameLocalizedValue(document.description, descObj) &&
      sameLocalizedValue(document.material, materialObj) &&
      JSON.stringify(categoryReferences(document.categories)) ===
        JSON.stringify(categoryReferences(categories)) &&
      JSON.stringify([...existingTagValues].sort()) ===
        JSON.stringify([...tagValues].sort());
    if (sameCommerceStructure) {
      return new StepResponse({
        success: true,
        productId,
        skipped: true,
        reason: "no_structural_changes",
      });
    }

    const patchSet: Record<string, unknown> = {
      medusaId: product.id,
      updatedBy: "medusa",
      syncOrigin: "medusa",
      correlationId,
      slug: { _type: "slug", current: product.handle || product.id },
      title: titleObj,
      description: descObj,
      categories,
      tags: tagValues,
      material: materialObj,
    };
    await syncLock.mark(`sanity-echo:${sanityId}`, correlationId, 30);
    const stateFingerprint = createHash("sha256")
      .update(JSON.stringify(patchSet))
      .digest("hex");
    try {
      await sanityService.mutate([
        {
          createIfNotExists: {
            _id: sanityId,
            _type: "product",
          },
        },
        { patch: { id: sanityId, set: patchSet } },
      ]);
    } catch (error) {
      await syncLock.consume(`sanity-echo:${sanityId}`);
      const message =
        error instanceof Error ? error.message : "Unknown Sanity mutation failure";
      logger.error(
        `[Sanity Product Sync] Could not update product ${sanityId}: ${message}`,
      );
      return new StepResponse({
        success: false,
        productId,
        reason: "sanity_unavailable",
      });
    }

    return new StepResponse(
      { success: true, productId, correlationId, stateFingerprint },
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
        ([key]) => !["_id", "_rev", "_type"].includes(key),
      ),
    );
    await sanityService.mutate([
      { patch: { id: snapshot.sanityId, set: restoreFields } },
    ]);
  },
);
