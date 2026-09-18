import { 
  createWorkflow, 
  WorkflowResponse, 
  transform, 
  when 
} from "@medusajs/framework/workflows-sdk";
import { 
  createProductsWorkflow, 
  updateProductsWorkflow,
  createInventoryItemsWorkflow,
  createInventoryLevelsWorkflow
} from "@medusajs/medusa/core-flows";
import { 
  SanitySyncWorkflowInput, 
  MedusaCreatedProductResult, 
  MedusaCreatedInventoryItemResult 
} from "./types";
import { getSystemDefaultsStep } from "./steps/system-defaults";
import { inspectExistingProductStep } from "./steps/inspect-existing-product";
import { updateInventoryLevelsStep } from "./steps/update-inventory-levels";
import { linkVariantToInventoryStep } from "./steps/link-variant-to-inventory";
import { syncProductCategoriesStep } from "./steps/sync-product-categories";
import { mapSanityToMedusaProduct } from "./utils/mappers";

export const sanitySyncProductWorkflow = createWorkflow(
  "sanity-sync-product",
  (input: SanitySyncWorkflowInput) => {
    // 1. Fetch system metadata infrastructure defaults
    const systemDefaults = getSystemDefaultsStep();

    // 2. Extract out slugs and map or auto-create corresponding categories
    const rawCategories = transform({ input }, (data) => data.input.productData?.categories ?? []);
    const verifiedCategoryIds = syncProductCategoriesStep({ categories: rawCategories });

    // 3. Prepare payload parameters safely using a declarative data transform
    const lookupParams = transform({ input }, (data) => ({
      handle: data.input.productData?.slug ?? "",
      sku: `SANITY-${data.input.productData?._id.toUpperCase() ?? ""}`,
    }));

    // 4. Inspect existing database records across Product & Inventory layers
    const inspection = inspectExistingProductStep(lookupParams);

    when(inspection, (res) => res.exists)
      .then(() => {
        const updatePayload = transform({ input, inspection, verifiedCategoryIds }, (data) => ({
          products: [{
            id: data.inspection.productId!,
            title: data.input.productData!.title,
            description: data.input.productData!.description,
            weight: data.input.productData!.weightGrams ?? 0,
            category_ids: data.verifiedCategoryIds, // Sync Category Updates
          }]
        }));

        updateProductsWorkflow.run({ input: updatePayload });

        const inventoryPayload = transform({ input, inspection, systemDefaults }, (data) => ({
          inventoryItemId: data.inspection.inventoryItemId!,
          locationId: data.systemDefaults.stockLocationId!,
          stockedQuantity: data.input.productData!.stockCount,
        }));

        when(inventoryPayload, (inv) => !!inv.inventoryItemId && !!inv.locationId)
          .then(() => {
            updateInventoryLevelsStep(inventoryPayload);
          });
      });


    when(inspection, (res) => !res.exists)
      .then(() => {
        const createPayload = transform({ input, systemDefaults, verifiedCategoryIds }, (data) => {
          if (!data.input.productData) {
            return { products: [] };
          }
          const mappedProduct = mapSanityToMedusaProduct(
            data.input.productData,
            data.verifiedCategoryIds, // Bind Verified Category IDs cleanly
            data.systemDefaults.shippingProfileId,
            data.systemDefaults.salesChannelId
          );
          return { products: [mappedProduct] };
        });

        // 1. Create the Product and Variant models
        const createdProducts = createProductsWorkflow.run({ input: createPayload });

        // 2. Safely transform created products to inventory payload types
        const inventoryItemPayload = transform({ input, createdProducts }, (data) => {
          const productsList = data.createdProducts as unknown as MedusaCreatedProductResult[];
          const targetVariant = productsList?.[0]?.variants?.[0];
          
          return {
            inventory_items: [{
              sku: targetVariant?.sku ?? "",
              title: `${data.input.productData?.title ?? "CMS Item"} Inventory`,
              requires_shipping: true,
            }]
          };
        });

        // 3. Create the Inventory Item asset record
        const createdInventoryItems = createInventoryItemsWorkflow.run({ input: inventoryItemPayload });

        // 4. Concurrently tie the relationships and update real-time stock levels
        const workflowWiringPayload = transform(
          { createdProducts, createdInventoryItems, systemDefaults, input }, 
          (data) => {
            const productsList = data.createdProducts as unknown as MedusaCreatedProductResult[];
            const inventoryList = data.createdInventoryItems as unknown as MedusaCreatedInventoryItemResult[];
            
            const variant = productsList?.[0]?.variants?.[0];
            const inventoryItem = inventoryList?.[0];

            return {
              variantId: variant?.id ?? "",
              inventoryItemId: inventoryItem?.id ?? "",
              locationId: data.systemDefaults.stockLocationId ?? "",
              stockedQuantity: data.input.productData?.stockCount ?? 0,
            };
          }
        );

        // 5. Execute cross-module Remote Link binding step and set location stock counts
        linkVariantToInventoryStep({
          variantId: workflowWiringPayload.variantId,
          inventoryItemId: workflowWiringPayload.inventoryItemId
        });

        const inventoryLevelPayload = transform({ workflowWiringPayload }, (data) => ({
          inventory_levels: [{
            inventory_item_id: data.workflowWiringPayload.inventoryItemId,
            location_id: data.workflowWiringPayload.locationId,
            stocked_quantity: data.workflowWiringPayload.stockedQuantity,
          }]
        }));

        createInventoryLevelsWorkflow.run({ input: inventoryLevelPayload });
      });

    return new WorkflowResponse({ success: true });
  }
);
