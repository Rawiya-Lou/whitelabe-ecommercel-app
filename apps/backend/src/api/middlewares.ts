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

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/wilaya-calculator",
      method: "POST",
      middlewares: [
        // Automatically checks incoming req.body against Zod. Returns a clean 400 bad request if invalid.
        validateAndTransformBody(CalculateShippingSchema),
      ],
    },
     {
      // Match your exact custom sync hook route
      matcher: "/sanity-sync",
      method: "POST",
      bodyParser: { preserveRawBody: true },
      // Automatically attach an internal token placeholder so live Sanity calls bypass the storefront auth guard
      middlewares: [
        (req, res, next) => {
          if (!req.headers["x-publishable-api-key"]) {
            req.headers["x-publishable-api-key"] =
              "pk_ea79ea0e54d16e2c6faf4b4bfb9049d3ad3b9a10fd7cc866d566f518f972999a";
          }
          next();
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
              `[Category Delete Guard] Could not verify product assignments for category [${categoryId}].`
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
