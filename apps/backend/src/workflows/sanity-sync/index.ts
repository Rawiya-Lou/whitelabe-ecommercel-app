import {
  createWorkflow,
  WorkflowResponse,
  transform,
  when,
} from "@medusajs/framework/workflows-sdk";
import {
  createProductsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import { SanitySyncWorkflowInput, SyncWorkflowResult } from "./types";

import { getSystemDefaultsStep } from "./steps/system-defaults";
import { inspectExistingProductStep } from "./steps/inspect-existing-product";
import { updateInventoryLevelsStep } from "./steps/update-inventory-levels";
import { linkVariantToInventoryStep } from "./steps/link-variant-to-inventory";
import { syncProductCategoriesStep } from "./steps/sync-product-categories";
import { createFreshInventoryStep } from "./steps/create-fresh-inventory";
import { batchSyncStep } from "./steps/batch-sync-step";
import { deleteCatalogItemStep } from "./steps/delete-catalog-item";
import { mapSanityToMedusaProduct } from "./utils/mappers";

export const sanitySyncProductWorkflow = createWorkflow(
  "sanity-sync-product",
  (input: SanitySyncWorkflowInput): WorkflowResponse<SyncWorkflowResult> => {
    const systemDefaults = getSystemDefaultsStep();
    // LAYER 1: HIGH-VOLUME BATCH SYNCHRONIZATION
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

    // LAYER 2: SECURE CASCADE DELETION ENGINE

    const isDeleteOp = transform(
      { input },
      (data) => data.input.operation === "delete",
    );

    when("execute-deletion-lane", isDeleteOp, (condition) => condition).then(
      () => {
        const deletionParams = transform({ input }, (data) => ({
          slug: data.input.productData?.slug || "",
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

    // LAYER 3: SINGLE RECORD INGESTION PIPELINE (UPSERT GRAPH)

    const rawCategories = transform({ input, isSingleUpsert }, (data) =>
      data.isSingleUpsert ? (data.input.productData?.categories ?? []) : [],
    );

    const verifiedCategoryIds = syncProductCategoriesStep({
      categories: rawCategories,
    }).config({ name: "sync-single-product-categories" });

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

    // THE PRODUCT ALREADY EXISTS (PURE UPDATE PATH)
    const isUpdateOp = transform(
      { inspection, input, isSingleUpsert },
      (data) => Boolean(data.isSingleUpsert && data.inspection.productExists),
    );

    when("product-exists-update-branch", isUpdateOp, (cond) => cond).then(
      () => {
        const updatePayload = transform(
          { input, inspection, verifiedCategoryIds },
          (data) => ({
            products: [
              {
                id: data.inspection.productId!,
                title: data.input.productData!.title.en,
                description: data.input.productData!.description.en,
                weight: data.input.productData!.weightGrams ?? 0,
                category_ids: data.verifiedCategoryIds,
              },
            ],
          }),
        );

        // Core Metadata Property Alterations
        updateProductsWorkflow.runAsStep({ input: updatePayload });

        // Provision and verify inventory allocations idempotently up front
        const freshInventoryParams = transform(
          { inspection, variantSku: variantSkuToken, input, systemDefaults },
          (data) => ({
            inventoryItemExists: true,
            preexistingInventoryItemId: data.inspection.inventoryItemId ?? "",
            sku: data.variantSku,
            title: `${data.input.productData?.title?.en ?? "CMS Asset"} Inventory`,
            stockLocationId: data.systemDefaults.stockLocationId ?? "",
            quantity: data.input.productData?.stockCount ?? 0,
            originCountry: data.input.productData?.originCountry,
          }),
        );

        //Configured with a unique step name mapping key signature
        const inventorySyncResult = createFreshInventoryStep(
          freshInventoryParams,
        ).config({
          name: "update-lane-inventory-provisioning",
        });

        // Link records dynamically using structural lookup hooks
        const workflowWiringPayload = transform(
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

        // Configured with a unique step name mapping key signature
        linkVariantToInventoryStep(workflowWiringPayload).config({
          name: "update-lane-relationship-linkage",
        });

        // Warehouse Stock Matrix Allocations
        const inventoryUpdateParams = transform(
          { input, inspection, systemDefaults },
          (data) => ({
            inventoryItemId: data.inspection.inventoryItemId ?? "",
            stockLocationId: data.systemDefaults.stockLocationId ?? "",
            stockedQuantity: data.input.productData?.stockCount ?? 0,
          }),
        );

        updateInventoryLevelsStep(inventoryUpdateParams);
      },
    );

    // THE PRODUCT IS ABSENT (PURE CREATION PATH)
    const isCreateOp = transform(
      { inspection, input, isSingleUpsert },
      (data) => Boolean(data.isSingleUpsert && !data.inspection.productExists),
    );
    when("product-absent-creation-branch", isCreateOp, (cond) => cond).then(
      () => {
        const createPayload = transform(
          { input, systemDefaults, verifiedCategoryIds },
          (data) => {
            if (!data.input.productData) return { products: [] };
            const mappedProduct = mapSanityToMedusaProduct(
              data.input.productData,
              data.verifiedCategoryIds,
              data.systemDefaults.shippingProfileId,
              data.systemDefaults.salesChannelId,
            );
            return {
              products: [
                {
                  ...mappedProduct,
                  sales_channels: data.systemDefaults.salesChannelId
                    ? [{ id: data.systemDefaults.salesChannelId }]
                    : [],
                },
              ],
            };
          },
        );

        // Spawns Product entries inside core engine tables cleanly (WITHOUT SKU to prevent internal workflow crashes)
        const createdProducts = createProductsWorkflow.runAsStep({
          input: createPayload,
        });

        // Provision lightweight inventory items independently
        const freshInventoryParams = transform(
          { inspection, variantSku: variantSkuToken, input, systemDefaults },
          (data) => ({
            inventoryItemExists: false,
            preexistingInventoryItemId: "",
            sku: data.variantSku,
            title: `${data.input.productData?.title?.en ?? "CMS Asset"} Inventory`,
            stockLocationId: data.systemDefaults.stockLocationId ?? "",
            quantity: data.input.productData?.stockCount ?? 0,
            originCountry: data.input.productData?.originCountry,
          }),
        );

        // Configured with a unique step name mapping key signature
        const inventorySyncResult = createFreshInventoryStep(
          freshInventoryParams,
        ).config({
          name: "create-lane-inventory-provisioning",
        });

        // Inject custom SKU text configurations and bind multi-module remote link bridges safely
        const workflowWiringPayload = transform(
          {
            createdProducts,
            inventorySyncResult,
            systemDefaults,
            input,
            variantSku: variantSkuToken,
          },
          (data) => {
            const targetVariantId =
              data.createdProducts?.[0]?.variants?.[0]?.id ?? "";

            return {
              shouldLink: true,
              variantId: targetVariantId,
              inventoryItemId: data.inventorySyncResult.inventoryItemId,
              stockLocationId: data.systemDefaults.stockLocationId ?? "",
              stockedQuantity: data.input.productData?.stockCount ?? 0,
              sku: data.variantSku,
            };
          },
        );

        // Configured with a unique step name mapping key signature

        linkVariantToInventoryStep(workflowWiringPayload).config({
          name: "create-lane-relationship-linkage",
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
              : data.inspection.productExists
                ? ("updated" as const)
                : ("created" as const),
      })),
    );
  },
);

export default sanitySyncProductWorkflow;
