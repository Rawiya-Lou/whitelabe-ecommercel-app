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
import { linkVariantToInventoryStep } from "./steps/link-variant-to-inventory";
import { syncProductCategoriesStep } from "./steps/sync-product-categories";
import { createFreshInventoryStep } from "./steps/create-fresh-inventory";
import { batchSyncStep } from "./steps/batch-sync-step";
import { deleteCatalogItemStep } from "./steps/delete-catalog-item";
import { mapSanityToMedusaProduct } from "./utils/mappers";
import "./hooks/before-product-delete";
import "./hooks/before-category-delete";
import "./hooks/on-product-mutation";
import "./hooks/on-category-mutation";

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

    // LAYER 3: SINGLE RECORD INGESTION PIPELINE (UPSERT GRAPH)

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

    // THE PRODUCT ALREADY EXISTS (PURE UPDATE PATH)
    const isUpdateOp = transform(
      { inspection, input, isSingleUpsert },
      (data) => Boolean(data.isSingleUpsert && data.inspection.productExists),
    );

    when("product-exists-update-branch", isUpdateOp, (cond) => cond).then(
      () => {
        const updatePayload = transform(
          { input, inspection, resolvedCategoryIds },
          (data) => ({
            products: [
              {
                id: data.inspection.productId!,
                title: data.input.productData!.title.en,
                description: data.input.productData!.description.en,
                weight: data.input.productData!.weightGrams ?? 0,
                thumbnail: data.input.productData!.images?.[0]?.url,
                images: (data.input.productData!.images ?? []).map((image) => ({
                  url: image.url,
                  alt: image.altText || "Product image",
                })),
                categories: data.resolvedCategoryIds.map((id) => ({ id })),
                variants: [
                  {
                    id: data.inspection.variantId!,
                    prices: [
                      {
                        currency_code: "dzd",
                        amount: Math.round(
                          data.input.productData!.basePriceDzd * 100,
                        ),
                      },
                      {
                        currency_code: "eur",
                        amount: Math.round(
                          data.input.productData!.basePriceEur * 100,
                        ),
                      },
                      {
                        currency_code: "usd",
                        amount: Math.round(
                          data.input.productData!.basePriceUsd * 100,
                        ),
                      },
                    ],
                  },
                ],
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
      },
    );

    // THE PRODUCT IS ABSENT (PURE CREATION PATH)
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

        // Spawns Product entries inside core engine tables cleanly (WITHOUT SKU to prevent internal workflow crashes)
        const createdProducts = createProductsWorkflow.runAsStep({
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
              : data.inspection.productExists
                ? ("updated" as const)
                : ("created" as const),
      })),
    );
  },
);

export default sanitySyncProductWorkflow;
