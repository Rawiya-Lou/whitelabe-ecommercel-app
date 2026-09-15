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
  ],
})
