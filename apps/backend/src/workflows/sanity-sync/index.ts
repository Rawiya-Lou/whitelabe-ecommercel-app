import {
  createWorkflow,
  WorkflowResponse,
  transform,
  when,
} from "@medusajs/framework/workflows-sdk";
import { ProductStatus } from "@medusajs/framework/utils";
import {
  createProductsWorkflow,
  updateProductsWorkflow,
  UpdateProductWorkflowInput,
} from "@medusajs/medusa/core-flows";
import {
  SanitySyncWorkflowInput,
  SyncWorkflowResult,
  ProductInspectionDTO,
} from "./types";
import { getSystemDefaultsStep } from "./steps/system-defaults";
import { inspectExistingProductStep } from "./steps/inspect-existing-product";
import { ensureProductInventoryStep } from "./steps/ensure-product-inventory";
import { syncProductCategoriesStep } from "./steps/sync-product-categories";
import { batchSyncStep } from "./steps/batch-sync-step";
import { deleteCatalogItemStep } from "./steps/delete-catalog-item";
import { mapSanityToMedusaProduct } from "./utils/mappers";
import { syncVariantImagesFromSanityStep } from "./steps/sync-variant-images-from-sanity";
import { resolveProductTagsStep } from "./steps/resolve-product-tags";


interface UpdateBranchTransformInput {
  input: SanitySyncWorkflowInput;
  inspection: ProductInspectionDTO;
  resolvedCategoryIds: string[];
  resolvedTagIds: string[];
}

const safeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const sanitySyncProductWorkflow = createWorkflow(
  "sanity-sync-product",
  (input: SanitySyncWorkflowInput): WorkflowResponse<SyncWorkflowResult> => {
    const systemDefaults = getSystemDefaultsStep();

    const isBatchOp = transform(
      { input },
      (data) => data.input.operation === "batch",
    );

    when("execute-batch-sync-lane", isBatchOp, (condition) => condition).then(
      () => {
        const batchChunkParams = transform(
          { input, systemDefaults },
          (data) => {
            const products = data.input.batchProducts ?? [];
            const structuralCategories = products.flatMap(
              (p) => p.categories ?? [],
            );
            return { products, categories: structuralCategories };
          },
        );

        const batchVerifiedCategoryIds = syncProductCategoriesStep({
          categories: batchChunkParams.categories,
        }).config({ name: "sync-batch-product-categories" });

        const flattenedBatchInput = transform(
          { batchChunkParams, batchVerifiedCategoryIds, systemDefaults },
          (data) => ({
            products: data.batchChunkParams.products,
            categoryIds: data.batchVerifiedCategoryIds,
            systemDefaults: data.systemDefaults,
          }),
        );

        batchSyncStep(flattenedBatchInput);
      },
    );

    const isDeleteOp = transform(
      { input },
      (data) => data.input.operation === "delete",
    );

    when("execute-deletion-lane", isDeleteOp, (condition) => condition).then(
      () => {
        const deletionParams = transform({ input }, (data) => ({
          slug: data.input.productData?.slug || "",
          targetId: data.input.deletionTargetId,
          type:
            data.input.documentType === "category"
              ? ("category" as const)
              : ("product" as const),
        }));

        deleteCatalogItemStep(deletionParams);
      },
    );

    const isSingleUpsert = transform(
      { input },
      (data) =>
        data.input.operation === "create" || data.input.operation === "update",
    );
    const incomingTagValues = transform({ input }, (data) => {
      const tags: unknown = data.input.productData?.tags;
      if (!Array.isArray(tags)) return [];
      return tags.flatMap((tag) => {
        if (typeof tag === "string") return [tag];
        return isRecord(tag) && typeof tag.value === "string"
          ? [tag.value]
          : [];
      });
    });
    const resolvedTagIds = resolveProductTagsStep({
      values: incomingTagValues,
    });

    const rawCategories = transform({ input, isSingleUpsert }, (data) =>
      data.isSingleUpsert ? (data.input.productData?.categories ?? []) : [],
    );

    const verifiedCategoryIds = syncProductCategoriesStep({
      categories: rawCategories,
    }).config({ name: "sync-single-product-categories" });

    const resolvedCategoryIds = transform(
      { input, verifiedCategoryIds },
      (data) =>
        Array.from(
          new Set([
            ...(data.input.categoryIds ?? []),
            ...data.verifiedCategoryIds,
          ]),
        ),
    );

    const variantSkuToken = transform({ input, isSingleUpsert }, (data) =>
      data.isSingleUpsert
        ? `SANITY-${(data.input.productData?._id ?? "").toUpperCase()}`
        : "",
    );

    const lookupParams = transform(
  { input, variantSku: variantSkuToken, isSingleUpsert },
  (data) => {
    const rawSlug = data.input.productData?.slug;
    const cleanSlug =
      typeof rawSlug === "object" && rawSlug !== null && "current" in rawSlug
        ? (rawSlug as any).current
        : typeof rawSlug === "string"
        ? rawSlug
        : "";

    return {
      productSlug: data.isSingleUpsert && cleanSlug ? cleanSlug : "bypass-slug",
      variantSku: data.variantSku,
    };
  },
);
    const inspection = inspectExistingProductStep(lookupParams);

    const isUpdateOp = transform(
      { inspection, input, isSingleUpsert },
      (data) => Boolean(data.isSingleUpsert && data.inspection.productExists),
    );

    when("product-exists-update-branch", isUpdateOp, (cond) => cond).then(
      () => {
        const updatePayload = transform<
          UpdateBranchTransformInput,
          UpdateProductWorkflowInput
        >(
          { input, inspection, resolvedCategoryIds, resolvedTagIds },
          (data) => {
          const prodData =
            (data.input.productData as Record<string, any>) || {};
          const incomingMeta = (prodData.metadata as Record<string, any>) || {};
          const existingMeta =
            (data.inspection.metadata as Record<string, any> | undefined) || {};
          const incomingTranslations =
            (incomingMeta.translations as Record<string, any>) || {};
          const existingTranslations =
            (existingMeta.translations as Record<string, any>) || {};
          const resolveLang = (
            field: unknown,
            metaKey: string,
            lang: string,
          ): string => {
            if (
              field &&
              typeof field === "object" &&
              !Array.isArray(field) &&
              Object.prototype.hasOwnProperty.call(field, lang)
            ) {
              return safeText((field as Record<string, unknown>)[lang]);
            }
            if (
              Object.prototype.hasOwnProperty.call(
                incomingMeta,
                `${metaKey}_${lang}`,
              )
            ) {
              return safeText(incomingMeta[`${metaKey}_${lang}`]);
            }
            if (
              incomingTranslations[lang] &&
              Object.prototype.hasOwnProperty.call(
                incomingTranslations[lang],
                metaKey,
              )
            ) {
              return safeText(incomingTranslations[lang][metaKey]);
            }
            if (lang === "en" && typeof field === "string") {
              return field.trim();
            }
            if (
              existingTranslations[lang] &&
              Object.prototype.hasOwnProperty.call(
                existingTranslations[lang],
                metaKey,
              )
            ) {
              return safeText(existingTranslations[lang][metaKey]);
            }
            if (
              Object.prototype.hasOwnProperty.call(
                existingMeta,
                `${metaKey}_${lang}`,
              )
            ) {
              return safeText(existingMeta[`${metaKey}_${lang}`]);
            }
            if (lang === "en" && metaKey === "material")
              return safeText(existingMeta.material);
            if (lang === "en" && metaKey === "description")
              return safeText(data.inspection.description);
            if (lang === "fr" && metaKey === "title")
              return safeText(data.inspection.subtitle);
            return "";
          };

          const strTitleEn =
            resolveLang(prodData.title, "title", "en") ||
            data.inspection.title ||
            "Updated Product";
          const strTitleFr = resolveLang(prodData.title, "title", "fr");
          const strTitleAr = resolveLang(prodData.title, "title", "ar");

          const strDescEn = resolveLang(
            prodData.description,
            "description",
            "en",
          );
          const strDescFr = resolveLang(
            prodData.description,
            "description",
            "fr",
          );
          const strDescAr = resolveLang(
            prodData.description,
            "description",
            "ar",
          );

          const incomingImageMetadata = (prodData.images ?? []).map(
            (img: any, index: number) => ({
              url: img.url,
              sanity_asset_id: img.asset?._ref || img._key || `img_${index}`,
              alt: {
                en:
                  safeText(img.alt?.en) ||
                  safeText(img.alt_en) ||
                  safeText(img.alt) ||
                  "Product image",
                fr: safeText(img.alt?.fr) || safeText(img.alt_fr),
                ar: safeText(img.alt?.ar) || safeText(img.alt_ar),
              },
            }),
          );
          const compiledImageMetadata =
            incomingImageMetadata.length > 0
              ? incomingImageMetadata
              : existingMeta.image_metadata || [];
          const fieldsPresent = prodData.syncFieldsPresent || {
            tags: true,
            images: true,
            variants: true,
          };
          const shouldUpdateTags = fieldsPresent.tags !== false;
          const shouldUpdateImages =
            fieldsPresent.images !== false || fieldsPresent.variants !== false;
          const shouldUpdateVariants = fieldsPresent.variants !== false;
          const tagValues = shouldUpdateTags
            ? (Array.isArray(prodData.tags) ? prodData.tags : [])
                .map((tag: unknown) =>
                  typeof tag === "string"
                    ? tag.trim()
                    : isRecord(tag) && typeof tag.value === "string"
                      ? tag.value.trim()
                      : "",
                )
                .filter(Boolean)
            : Array.isArray(existingMeta.tags)
              ? existingMeta.tags
              : [];
          const optionUpdates = (prodData.variantOptions ?? [])
            .filter(
              (option: any) =>
                typeof option.title === "string" &&
                Array.isArray(option.values),
            )
            .map((option: any) => ({
              title: option.title,
              values: option.values.filter(
                (value: unknown) =>
                  typeof value === "string" && value.trim().length > 0,
              ),
            }));
          const variantUpdates = (prodData.variants ?? []).flatMap(
            (variant: any) => {
              const sanityVariantId =
                variant.medusa_variant_id || variant.variantId || variant._key;
              const incomingOptions: Record<string, string> = Array.isArray(
                variant.options,
              )
                ? variant.options.reduce(
                    (values: Record<string, string>, option: any) => {
                      if (
                        typeof option?.option === "string" &&
                        typeof option?.value === "string"
                      ) {
                        values[option.option] = option.value;
                      }
                      return values;
                    },
                    {},
                  )
                : isRecord(variant.options)
                  ? Object.fromEntries(
                      Object.entries(variant.options).filter(
                        (entry): entry is [string, string] =>
                          typeof entry[1] === "string",
                      ),
                    )
                  : {};
              const existingVariant = data.inspection.variants?.find(
                (candidate) => {
                  if (candidate.id === sanityVariantId) return true;
                  if (
                    sanityVariantId &&
                    candidate.metadata?.sanity_variant_id === sanityVariantId
                  ) {
                    return true;
                  }
                  if (
                    typeof variant.sku === "string" &&
                    variant.sku &&
                    candidate.sku === variant.sku
                  ) {
                    return true;
                  }
                  const candidateOptions = Object.fromEntries(
                    (candidate.options ?? []).flatMap((option) =>
                      option.option?.title && option.value
                        ? [[option.option.title, option.value]]
                        : [],
                    ),
                  );
                  const optionEntries = Object.entries(incomingOptions);
                  return (
                    optionEntries.length > 0 &&
                    optionEntries.length ===
                      Object.keys(candidateOptions).length &&
                    optionEntries.every(
                      ([title, value]) => candidateOptions[title] === value,
                    )
                  );
                },
              );
              if (!existingVariant) {
                return [];
              }
              const variantId = existingVariant.id;
              const variantImages = (variant.images ?? []).map(
                (image: any, index: number) => ({
                  url: image.url,
                  sanity_asset_id:
                    image.asset?._ref || image._key || `variant_img_${index}`,
                  alt: {
                    en:
                      safeText(image.alt?.en) ||
                      safeText(image.alt_en) ||
                      safeText(image.alt),
                    fr: safeText(image.alt?.fr) || safeText(image.alt_fr),
                    ar: safeText(image.alt?.ar) || safeText(image.alt_ar),
                  },
                }),
              );
              return [
                {
                  id: variantId,
                  thumbnail: variantImages[0]?.url ?? null,
                  ...(safeText(existingVariant.origin_country).toUpperCase() ===
                  "DZ"
                    ? { origin_country: null }
                    : {}),
                  metadata: {
                    ...(isRecord(variant.metadata) ? variant.metadata : {}),
                    variant_images: variantImages,
                  },
                },
              ];
            },
          );
          const translations = {
            en: {
              ...(existingTranslations.en || {}),
              ...(incomingTranslations.en || {}),
              title: strTitleEn,
              description: strDescEn,
              material: resolveLang(prodData.material, "material", "en"),
            },
            fr: {
              ...(existingTranslations.fr || {}),
              ...(incomingTranslations.fr || {}),
              title: strTitleFr,
              description: strDescFr,
              material: resolveLang(prodData.material, "material", "fr"),
            },
            ar: {
              ...(existingTranslations.ar || {}),
              ...(incomingTranslations.ar || {}),
              title: strTitleAr,
              description: strDescAr,
              material: resolveLang(prodData.material, "material", "ar"),
            },
          };

          const realSanityId =
            prodData._id ||
            incomingMeta.sanity_id ||
            data.input.productData?._id ||
            data.inspection.productId!;
          const incomingOriginCountry = safeText(
            prodData.originCountry,
          ).toUpperCase();

          return {
            products: [
              {
                id: data.inspection.productId!,
                title: strTitleEn,
                status: ProductStatus.PUBLISHED,
                subtitle: strTitleFr || null,
                description: strDescEn || null,
                material:
                  resolveLang(prodData.material, "material", "en") || null,
                ...(incomingOriginCountry
                  ? {
                      origin_country:
                        incomingOriginCountry === "DZ"
                          ? null
                          : incomingOriginCountry,
                    }
                  : safeText(data.inspection.originCountry).toUpperCase() ===
                      "DZ"
                    ? { origin_country: null }
                    : {}),
                weight: data.input.productData!.weightGrams ?? 0,
                ...(shouldUpdateImages
                  ? {
                      ...(prodData.images?.[0]?.url
                        ? { thumbnail: prodData.images[0].url }
                        : {}),
                      images: (prodData.images ?? []).map((image: any) => ({
                        url: image.url,
                      })),
                    }
                  : {}),
                ...(shouldUpdateTags
                  ? {
                      tags: data.resolvedTagIds.map((id) => ({ id })),
                    }
                  : {}),
                categories: data.resolvedCategoryIds.map((id: string) => ({
                  id,
                })),
                ...(optionUpdates.length > 0 ? { options: optionUpdates } : {}),
                ...(variantUpdates.length > 0
                  ? { variants: variantUpdates }
                  : {}),
                metadata: {
                  ...existingMeta,
                  ...incomingMeta,
                  sanity_id: realSanityId,
                  is_sync_origin: "sanity",
                  updatedBy: "sanity-studio",
                  translations,
                  title_en: strTitleEn,
                  title_fr: translations.fr.title,
                  title_ar: translations.ar.title,
                  description_en: translations.en.description,
                  description_fr: translations.fr.description,
                  description_ar: translations.ar.description,
                  material_en: translations.en.material,
                  material_fr: translations.fr.material,
                  material_ar: translations.ar.material,
                  tags: tagValues,
                  ...(shouldUpdateVariants
                    ? {
                        variant_images: incomingMeta.variant_images || {},
                      }
                    : {}),
                  ...(shouldUpdateImages
                    ? {
                        image_metadata: compiledImageMetadata,
                      }
                    : {}),
                },
              },
            ],
          };
          },
        );

        updateProductsWorkflow.runAsStep({ input: updatePayload });

        const variantMediaInput = transform(
          { input, inspection },
          (data) => ({
            productHandle:
              typeof data.input.productData?.slug === "string"
                ? data.input.productData.slug
                : "",
            shouldSync:
              data.input.productData?.syncFieldsPresent?.variants !== false,
            previousLinks: data.inspection.variantImageLinks ?? [],
          }),
        );
        syncVariantImagesFromSanityStep(variantMediaInput).config({
          name: "sync-updated-variant-images",
        });

        const inventoryInput = transform(
          { input, systemDefaults },
          (data) => {
            const slug = data.input.productData?.slug;
            return {
              productHandle: typeof slug === "string" ? slug : "",
              stockLocationId: data.systemDefaults.stockLocationId,
            };
          },
        );
        ensureProductInventoryStep(inventoryInput).config({
          name: "update-lane-variant-inventory",
        });
      },
    );

    const isCreateOp = transform({ inspection, isSingleUpsert }, (data) =>
      Boolean(data.isSingleUpsert && !data.inspection.productExists),
    );

    when("product-absent-creation-branch", isCreateOp, (cond) => cond).then(
      () => {
        const createPayload = transform(
          { input, systemDefaults, resolvedCategoryIds, resolvedTagIds },
          (data) => {
            const raw = data.input.productData!;
            const mappedProduct = mapSanityToMedusaProduct(
              raw,
              data.resolvedCategoryIds,
              data.systemDefaults.shippingProfileId,
              data.systemDefaults.salesChannelId,
            );
            return {
              products: [
                {
                  ...mappedProduct,
                  tags: data.resolvedTagIds.map((id) => ({ id })),
                },
              ],
            };
          },
        );

        createProductsWorkflow.runAsStep({
          input: createPayload,
        });

        const variantMediaInput = transform({ input }, (data) => ({
          productHandle:
            typeof data.input.productData?.slug === "string"
              ? data.input.productData.slug
              : "",
          shouldSync:
            data.input.productData?.syncFieldsPresent?.variants !== false,
        }));
        syncVariantImagesFromSanityStep(variantMediaInput).config({
          name: "sync-created-variant-images",
        });

        const inventoryInput = transform(
          { input, systemDefaults },
          (data) => {
            const slug = data.input.productData?.slug;
            return {
            productHandle: slug || "",
            stockLocationId: data.systemDefaults.stockLocationId,
          };
          },
        );
        ensureProductInventoryStep(inventoryInput).config({
          name: "create-lane-variant-inventory",
        });
      },
    );

    return new WorkflowResponse(
      transform({ inspection, input }, (data) => ({
        success: true,
        operation:
          data.input.operation === "batch"
            ? ("batched" as const)
            : data.input.operation === "delete"
              ? ("deleted" as const)
              : data.inspection?.productExists
                ? ("updated" as const)
                : ("created" as const),
      })),
    );
  },
);

export default sanitySyncProductWorkflow;
