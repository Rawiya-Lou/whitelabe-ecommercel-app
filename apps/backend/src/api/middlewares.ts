import { defineMiddlewares } from "@medusajs/framework/http"
import { validateAndTransformBody } from "@medusajs/framework/http"
import { CalculateShippingSchema } from "./store/wilaya-calculator/validators"

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
      matcher: "/store/sanity-sync",
      method: "POST",
      // Automatically attach an internal token placeholder so live Sanity calls bypass the storefront auth guard
      middlewares: [
        (req, res, next) => {
          if (!req.headers["x-publishable-api-key"]) {
            req.headers["x-publishable-api-key"] = "pk_ea79ea0e54d16e2c6faf4b4bfb9049d3ad3b9a10fd7cc866d566f518f972999a";
          }
          next();
        }
      ]
    }
  ],
})
