import {
  defineMiddlewares,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { validateAndTransformBody } from "@medusajs/framework/http";
import { CalculateShippingSchema } from "./store/wilaya-calculator/validators";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/framework/types";
import { assertCategoryCanBeDeleted } from "../utils/product-category-delete-guard";
import { syncProductToSanityWorkflow } from "../workflows/sanity-sync/forward-sync-workflows";

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/wilaya-calculator",
      method: "POST",
      middlewares: [validateAndTransformBody(CalculateShippingSchema)],
    },
    {
      matcher: "/admin/sanity-sync",
      method: "POST",
      bodyParser: { preserveRawBody: true },
    },
 
    {
      matcher: "/admin/product-categories/:id/products",
      method: "POST",
      middlewares: [
        async (
          req: MedusaRequest,
          res: MedusaResponse,
          next: MedusaNextFunction,
        ) => {
          // Listen to when Medusa finishes saving the product-category links
          res.on("finish", async () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const logger = req.scope.resolve(
                ContainerRegistrationKeys.LOGGER,
              ) as Logger;

              const body = req.body as { add?: string[]; remove?: string[] };
              const affectedProductIds = [
                ...(body?.add || []),
                ...(body?.remove || []),
              ];

              if (affectedProductIds.length > 0) {
                logger.info(
                  `[Category Membership Hook] Detected ${affectedProductIds.length} product(s) modified in category ${req.params.id}. Triggering Sanity sync...`,
                );

                for (const productId of affectedProductIds) {
                  try {
                    await syncProductToSanityWorkflow(req.scope).run({
                      input: { productId },
                    });
                    logger.info(
                      `[Category Membership Hook] Successfully updated Sanity categories for product: ${productId}`,
                    );
                  } catch (error) {
                    logger.error(
                      `[Category Membership Hook] Failed to sync product ${productId} to Sanity: ${error}`,
                    );
                  }
                }
              }
            }
          });

          return next();
        },
      ],
    },

    {
      matcher: "/admin/product-categories/:id",
      method: "DELETE",
      middlewares: [
        async (
          req: MedusaRequest,
          _res: MedusaResponse,
          next: MedusaNextFunction,
        ) => {
          const logger = req.scope.resolve(
            ContainerRegistrationKeys.LOGGER,
          ) as Logger;
          const categoryId = req.params.id;
          const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

          try {
            const { data: categories } = await query.graph({
              entity: "product_category",
              fields: ["id", "name", "products.id"],
              filters: { id: [categoryId] },
            });
            const category = categories?.[0];

            if (!category) {
              return next();
            }

            try {
              assertCategoryCanBeDeleted(category);
            } catch (error) {
              logger.warn(
                `[Category Delete Guard] Rejected deletion of category [${categoryId}]; it still contains products.`,
              );
              throw error;
            }

            return next();
          } catch (error) {
            if (error instanceof MedusaError) {
              throw error;
            }
            logger.error(
              `[Category Delete Guard] Could not verify product assignments for category [${categoryId}].`,
            );
            throw new MedusaError(
              MedusaError.Types.UNEXPECTED_STATE,
              "Category deletion was stopped because its product assignments could not be verified.",
            );
          }
        },
      ],
    },
  ],
});