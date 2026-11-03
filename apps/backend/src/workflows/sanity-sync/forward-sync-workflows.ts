import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { syncProductToSanityStep } from "./steps/sync-product-to-sanity-step";
import { syncProductMaterialToInventoryStep } from "./steps/sync-product-material-to-inventory-step";
import { syncVariantsToSanityStep } from "./steps/sync-variants-to-sanity-step";
import { deleteProductFromSanityStep } from "./steps/delete-product-from-sanity-step";

export const syncProductToSanityWorkflow = createWorkflow(
  "sync-product-to-sanity",
  (input: { productId: string }) => {
    const materialSync = syncProductMaterialToInventoryStep(input);
    const productId = transform({ input, materialSync }, (data) =>
      data.input.productId,
    );
    const res = syncProductToSanityStep(productId);
    const variantSync = syncVariantsToSanityStep({
      productId: input.productId,
      afterProductSync: res,
    });
    return new WorkflowResponse(variantSync);
  }
);

export const deleteProductFromSanityWorkflow = createWorkflow(
  "delete-product-from-sanity",
  (input: { productId: string }) => {
    const res = deleteProductFromSanityStep(input.productId);
    return new WorkflowResponse(res);
  }
);