import {
  createWorkflow,
  WorkflowResponse,
  transform,
  when,
} from "@medusajs/framework/workflows-sdk";
import {
  createProductsWorkflow,
  updateProductsWorkflow,
  UpdateProductWorkflowInput,
} from "@medusajs/medusa/core-flows";
import {
  SanitySyncWorkflowInput,
  SyncWorkflowResult,
  ProductInspectionDTO,
  SystemDefaultsDTO,
  CreateFreshInventoryInput,
  LinkVariantInventoryInput,
  SanityProductPayload,
} from "./types";
import { getSystemDefaultsStep } from "./steps/system-defaults";
import { inspectExistingProductStep } from "./steps/inspect-existing-product";
import { linkVariantToInventoryStep } from "./steps/link-variant-to-inventory";
import { syncProductCategoriesStep } from "./steps/sync-product-categories";
import { createFreshInventoryStep } from "./steps/create-fresh-inventory";
import { batchSyncStep } from "./steps/batch-sync-step";
import { deleteCatalogItemStep } from "./steps/delete-catalog-item";
import { mapSanityToMedusaProduct } from "./utils/mappers";
import "./hooks/before-product-delete";
import "./hooks/before-category-delete";
// import "./hooks/on-product-mutation";
// import "./hooks/on-category-mutation";

interface UpdateBranchTransformInput {
  input: SanitySyncWorkflowInput;
  inspection: ProductInspectionDTO;
  resolvedCategoryIds: string[];
}

interface InventoryBranchTransformInput {
  inspection: ProductInspectionDTO;
  variantSku: string;
  input: {
    productData: SanityProductPayload;
  };
  systemDefaults: SystemDefaultsDTO;
}

interface LinkageBranchTransformInput {
  inspection: ProductInspectionDTO;
  inventorySyncResult: { inventoryItemId: string };
  systemDefaults: SystemDefaultsDTO;
  input: {
    productData: SanityProductPayload;
  };
  variantSku: string;
}

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
      (data) => ({
        productSlug: data.isSingleUpsert
          ? (data.input.productData?.slug ?? "")
          : "bypass-slug",
        variantSku: data.variantSku,
      }),
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
        >({ input, inspection, resolvedCategoryIds }, (data) => {
          const prodData =
            (data.input.productData as Record<string, any>) || {};
          const incomingMeta = (prodData.metadata as Record<string, any>) || {};
          const incomingTranslations =
            (incomingMeta.translations as Record<string, any>) || {};
          const resolveLang = (
            field: any,
            metaKey: string,
            lang: string,
          ): string => {
            if (field && typeof field === "object" && field[lang]) {
              return String(field[lang]).trim();
            }
            if (incomingMeta[`${metaKey}_${lang}`]) {
              return String(incomingMeta[`${metaKey}_${lang}`]).trim();
            }
            if (incomingTranslations[lang]?.[metaKey]) {
              return String(incomingTranslations[lang][metaKey]).trim();
            }
            if (lang === "en" && typeof field === "string") {
              return field.trim();
            }
            return "";
          };

          const strTitleEn =
            resolveLang(prodData.title, "title", "en") || "Updated Product";
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

          const compiledImageMetadata = (prodData.images ?? []).map(
            (img: any, index: number) => ({
              url: img.url,
              sanity_asset_id: img.asset?._ref || img._key || `img_${index}`,
              alt: {
                en: img.alt_en || img.alt || "Product image",
                fr: img.alt_fr || "",
                ar: img.alt_ar || "",
              },
            }),
          );

          const realSanityId =
            prodData._id ||
            incomingMeta.sanity_id ||
            data.input.productData?._id ||
            data.inspection.productId!;

          return {
            products: [
              {
                id: data.inspection.productId!,
                title: strTitleEn,
                subtitle: strTitleFr || null,
                description: strDescEn || null,
                weight: data.input.productData!.weightGrams ?? 0,
                thumbnail: data.input.productData!.images?.[0]?.url,
                images: (prodData.images ?? []).map((image: any) => ({
                  url: image.url,
                })),
                categories: data.resolvedCategoryIds.map((id: string) => ({
                  id,
                })),
                variants: [
                  {
                    id: data.inspection.variantId!,
                  },
                ],
                metadata: {
                  ...incomingMeta,
                  sanity_id: realSanityId,
                  is_sync_origin: "sanity",
                  updatedBy: "sanity-studio",
                  translations: {
                    en: { title: strTitleEn, description: strDescEn },
                    fr: { title: strTitleFr, description: strDescFr },
                    ar: { title: strTitleAr, description: strDescAr },
                  },
                  title_en: strTitleEn,
                  title_fr: strTitleFr,
                  title_ar: strTitleAr,
                  description_en: strDescEn,
                  description_fr: strDescFr,
                  description_ar: strDescAr,
                  image_metadata: compiledImageMetadata,
                },
              },
            ],
          };
        });

        updateProductsWorkflow.runAsStep({ input: updatePayload });

        // Inventory provisioning and linkage
        const freshInventoryParams = transform<
          InventoryBranchTransformInput,
          CreateFreshInventoryInput
        >(
          { inspection, variantSku: variantSkuToken, input, systemDefaults },
          (data) => {
            const prodData = data.input.productData || ({} as any);
            const inventoryTitle =
              typeof prodData.title === "string"
                ? prodData.title
                : String(prodData.title?.en || "CMS Asset");

            return {
              inventoryItemExists: true,
              preexistingInventoryItemId: data.inspection.inventoryItemId ?? "",
              sku: data.variantSku,
              title: `${inventoryTitle} Inventory`,
              stockLocationId: data.systemDefaults.stockLocationId ?? "",
              quantity: prodData.stockCount ?? 0,
              originCountry: prodData.originCountry || undefined,
            };
          },
        );

        const inventorySyncResult = createFreshInventoryStep(
          freshInventoryParams,
        ).config({
          name: "update-lane-inventory-provisioning",
        });

        const workflowWiringPayload = transform<
          LinkageBranchTransformInput,
          LinkVariantInventoryInput
        >(
          {
            inspection,
            inventorySyncResult,
            systemDefaults,
            input,
            variantSku: variantSkuToken,
          },
          (data) => ({
            shouldLink: false,
            variantId: data.inspection.variantId ?? "",
            inventoryItemId: data.inventorySyncResult.inventoryItemId,
            stockLocationId: data.systemDefaults.stockLocationId ?? "",
            stockedQuantity: data.input.productData?.stockCount ?? 0,
            sku: data.variantSku,
          }),
        );

        linkVariantToInventoryStep(workflowWiringPayload).config({
          name: "update-lane-relationship-linkage",
        });
      },
    );

    const isCreateOp = transform({ inspection, isSingleUpsert }, (data) =>
      Boolean(data.isSingleUpsert && !data.inspection.productExists),
    );

    when("product-absent-creation-branch", isCreateOp, (cond) => cond).then(
      () => {
        const createPayload = transform(
          { input, systemDefaults, resolvedCategoryIds },
          (data) => {
            const raw = data.input.productData!;
            const mappedProduct = mapSanityToMedusaProduct(
              raw,
              data.resolvedCategoryIds,
              data.systemDefaults.shippingProfileId,
              data.systemDefaults.salesChannelId,
            );
            return {
              products: [mappedProduct],
            };
          },
        );

        createProductsWorkflow.runAsStep({
          input: createPayload,
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
