import { 
  createWorkflow, 
  WorkflowResponse,  
  transform, 
  when 
} from "@medusajs/framework/workflows-sdk";
import { 
  createProductsWorkflow, 
  updateProductsWorkflow
} from "@medusajs/medusa/core-flows";
import { SanitySyncWorkflowInput, SyncWorkflowResult, WorkflowVariantDTO, WorkflowProductDTO } from "./types";

import { getSystemDefaultsStep } from "./steps/system-defaults";
import { inspectExistingProductStep } from "./steps/inspect-existing-product";
import { updateInventoryLevelsStep } from "./steps/update-inventory-levels";
import { linkVariantToInventoryStep } from "./steps/link-variant-to-inventory";
import { syncProductCategoriesStep } from "./steps/sync-product-categories";
import { createFreshInventoryStep } from "./steps/create-fresh-inventory";
import { mapSanityToMedusaProduct } from "./utils/mappers";

export const sanitySyncProductWorkflow = createWorkflow(
  "sanity-sync-product",
  (input: SanitySyncWorkflowInput): WorkflowResponse<SyncWorkflowResult> => {
    
    const systemDefaults = getSystemDefaultsStep();

    const rawCategories = transform({ input }, (data) => data.input.productData?.categories ?? []);
    const verifiedCategoryIds = syncProductCategoriesStep({ categories: rawCategories });

    const variantSkuToken = transform({ input }, (data) => {
      const id = data.input.productData?._id ?? "";
      return `SANITY-${id.toUpperCase()}`;
    });

    const lookupParams = transform({ input, variantSku: variantSkuToken }, (data) => ({
      productSlug: data.input.productData?.slug ?? "",
      variantSku: data.variantSku,
    }));

    const inspection = inspectExistingProductStep(lookupParams);

    // =========================================================================
    // BRANCH A: STABLE UPDATE ENGINE EXECUTION
    // =========================================================================
    when(inspection, (res) => res.productExists).then(() => {
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
        }) 
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

    when(inventoryUpdateParams, (inv) => inv.shouldExecute).then(() => {
      updateInventoryLevelsStep(inventoryUpdateParams);
    });

    // =========================================================================
    // BRANCH B: ATOMIC CREATION ENGINE EXECUTION (ENCAPSULATED STEP)
    // =========================================================================
    when(inspection, (res) => !res.productExists).then(() => {
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

      // Invoke custom step to encapsulate inner core inventory workflows safely
      const inventorySyncResult = createFreshInventoryStep(
        transform({ inspection, variantSku: variantSkuToken, input, systemDefaults }, (data) => ({
          inventoryItemExists: !!data.inspection.inventoryItemId,
          preexistingInventoryItemId: data.inspection.inventoryItemId ?? "",
          sku: data.variantSku,
          title: `${data.input.productData?.title?.en ?? "CMS Item"} Inventory`,
          stockLocationId: data.systemDefaults.stockLocationId ?? "",
          quantity: data.input.productData?.stockCount ?? 0
        }))
      );

      const workflowWiringPayload = transform(
        {
          createdProductsResult,
          inventorySyncResult,
          systemDefaults,
          input,
        },
        (data) => {
          const productsList = (data.createdProductsResult || []) as unknown as WorkflowProductDTO[];
          const variant = productsList?.[0]?.variants?.[0];

          return {
            variantId: variant?.id ?? "",
            inventoryItemId: data.inventorySyncResult.inventoryItemId,
            stockLocationId: data.systemDefaults.stockLocationId ?? "", 
            stockedQuantity: data.input.productData?.stockCount ?? 0, 
          };
        },
      );

      linkVariantToInventoryStep(workflowWiringPayload);
    });

    return new WorkflowResponse(
      transform({ inspection }, (data) => ({
        success: true,
        operation: data.inspection.productExists ? ("updated" as const) : ("created" as const)
      }))
    );
  }
);

export default sanitySyncProductWorkflow;
