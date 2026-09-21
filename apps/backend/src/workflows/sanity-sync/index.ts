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
import {
  SanitySyncWorkflowInput,
  SyncWorkflowResult,
  WorkflowProductDTO,
} from "./types";

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
    const isBatchOp = transform(
      { input },
      (data) => data.input.operation === "batch",
    );

    when("execute-batch-sync-lane", isBatchOp, (condition) => condition).then(() => {
      const batchChunkParams = transform({ input, systemDefaults }, (data) => {
        const products = data.input.batchProducts ?? [];
        const structuralCategories = products.flatMap(
          (p) => p.categories ?? [],
        );
        return {
          products,
          categories: structuralCategories,
        };
      });

      const batchVerifiedCategoryIds = syncProductCategoriesStep({
        categories: batchChunkParams.categories,
      }).config({ name: "sync-batch-product-categories" });

      const batchSyncResult = batchSyncStep({
        products: batchChunkParams.products,
        categoryIds: batchVerifiedCategoryIds,
        systemDefaults: systemDefaults,
      });

      return new WorkflowResponse(
        transform({ batchSyncResult }, (data) => ({
          success: true,
          operation: "batched" as const,
          details: data.batchSyncResult,
        })),
      );
    });

    const isDeleteOp = transform(
      { input },
      (data) => data.input.operation === "delete",
    );

    when("execute-deletion-lane", isDeleteOp, (condition) => condition).then(() => {
      const deletionParams = transform({ input }, (data) => {
        const slug = data.input.productData?.slug || "";
        const type =
          data.input.documentType === "category"
            ? ("category" as const)
            : ("product" as const);
        return { slug, type };
      });

      const deleteStepResult = deleteCatalogItemStep(deletionParams);

      return new WorkflowResponse(
        transform({ deleteStepResult }, (data) => ({
          success: data.deleteStepResult.deleted,
          operation: "deleted" as const,
          details: data.deleteStepResult,
        })),
      );
    });


    const rawCategories = transform(
      { input },
      (data) => data.input.productData?.categories ?? [],
    );
    const verifiedCategoryIds = syncProductCategoriesStep({
      categories: rawCategories,
    }).config({ name: "sync-single-product-categories" });

    const variantSkuToken = transform({ input }, (data) => {
      const id = data.input.productData?._id ?? "";
      return `SANITY-${id.toUpperCase()}`;
    });

    const lookupParams = transform(
      { input, variantSku: variantSkuToken },
      (data) => ({
        productSlug: data.input.productData?.slug ?? "",
        variantSku: data.variantSku,
      }),
    );

    const inspection = inspectExistingProductStep(lookupParams);

    const isUpdate = transform({ inspection }, (data) => data.inspection.productExists);


    when("product-exists-update-branch", isUpdate, (condition) => condition).then(() => {
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

      updateProductsWorkflow.runAsStep({ input: updatePayload });
    });

    const inventoryUpdateParams = transform(
      { input, inspection, systemDefaults },
      (data) => ({
        shouldExecute:
          data.inspection.productExists &&
          !!data.inspection.inventoryItemId &&
          !!data.systemDefaults.stockLocationId,
        inventoryItemId: data.inspection.inventoryItemId ?? "",
        stockLocationId: data.systemDefaults.stockLocationId ?? "",
        stockedQuantity: data.input.productData?.stockCount ?? 0,
      }),
    );

    when("update-existing-inventory-levels-branch",inventoryUpdateParams, (inv) => inv.shouldExecute).then(() => {
      updateInventoryLevelsStep(inventoryUpdateParams);
    });
    

    when("product-absent-creation-branch",inspection, (res) => !res.productExists).then(() => {
      const createPayload = transform(
        { input, systemDefaults, verifiedCategoryIds },
        (data) => {
          if (!data.input.productData) {
            return { products: [] };
          }
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

      const createdProductsResult = createProductsWorkflow.runAsStep({
        input: createPayload,
      });

      const inventorySyncResult = createFreshInventoryStep(
        transform(
          { inspection, variantSku: variantSkuToken, input, systemDefaults },
          (data) => ({
            inventoryItemExists: !!data.inspection.inventoryItemId,
            preexistingInventoryItemId: data.inspection.inventoryItemId ?? "",
            sku: data.variantSku,
            title: `${data.input.productData?.title?.en ?? "CMS Item"} Inventory`,
            stockLocationId: data.systemDefaults.stockLocationId ?? "",
            quantity: data.input.productData?.stockCount ?? 0,
          }),
        ),
      );

      const workflowWiringPayload = transform(
        {
          inspection,
          inventorySyncResult,
          systemDefaults,
          input,
        },
        (data) => ({
          shouldLink: !data.inspection.productExists,
        
       
            variantId: data?.inspection.variantId ?? "",
            inventoryItemId: data.inventorySyncResult.inventoryItemId,
            stockLocationId: data.systemDefaults.stockLocationId ?? "",
            stockedQuantity: data.input.productData?.stockCount ?? 0,
          
        }),
      );

      linkVariantToInventoryStep(workflowWiringPayload);
    });

    return new WorkflowResponse(
      transform({ inspection }, (data) => ({
        success: true,
        operation: data.inspection.productExists
          ? ("updated" as const)
          : ("created" as const),
      })),
    );
  }
);

export default sanitySyncProductWorkflow;
