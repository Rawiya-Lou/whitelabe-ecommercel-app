import Medusa from "@medusajs/js-sdk";
import { env } from "@/app/env.mjs";

export const medusaClient = new Medusa({
  baseUrl: env.NEXT_PUBLIC_MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
  publishableKey: env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
});
