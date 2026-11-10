import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Automatically treats empty strings `""` as `undefined`.
   * Essential for optional variables like UPSTASH or SANITY tokens on Vercel.
   */
  emptyStringAsUndefined: true,

  /**
   * Server-side Environment Variables
   * Accessible ONLY in Server Components, API routes, Server Actions, and proxy.ts.
   * T3 Env guarantees these will NEVER leak to the browser client bundle.
   */
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // Medusa Backend (Hosted on Render)
    MEDUSA_BACKEND_URL: z.url().default("http://localhost:9000"),

    // Sanity CMS Read Token (For draft previews or private dataset fetches)
    SANITY_API_READ_TOKEN: z.string().min(1).optional(),

    // Free Tier Rate Limiting (Upstash REST on Vercel)
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

    // Payment Secrets (Server-side webhooks / session creation)
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    CHARGILY_API_KEY: z.string().min(1).optional(),
  },

  /**
   * Client-side Environment Variables (Available in the browser & edge)
   * MUST be prefixed with NEXT_PUBLIC_.
   */
  client: {
    // Medusa Client Connection
    NEXT_PUBLIC_MEDUSA_BACKEND_URL: z.url().default("http://localhost:9000"),
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: z.string().min(1),

    // Sanity Visual & Content Configuration
    NEXT_PUBLIC_SANITY_PROJECT_ID: z.string().min(1).default("4vzx52ot"),
    NEXT_PUBLIC_SANITY_DATASET: z.string().min(1).default("production"),

    // CDN & Asset Storage
    NEXT_PUBLIC_STORAGE_BUCKET_HOSTNAME: z.string().optional(),

    // Client-side Payment Identifiers
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_CHARGILY_PUBLIC_KEY: z.string().min(1).optional(),
  },

  /**
   * Runtime Mapping:
   * With Next.js, ONLY client variables (`NEXT_PUBLIC_*`) need manual destructuring.
   * Server variables are automatically read from process.env at runtime.
   */
  experimental__runtimeEnv: {
    NEXT_PUBLIC_MEDUSA_BACKEND_URL: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL,
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SANITY_PROJECT_ID: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
    NEXT_PUBLIC_SANITY_DATASET: process.env.NEXT_PUBLIC_SANITY_DATASET,
    NEXT_PUBLIC_STORAGE_BUCKET_HOSTNAME:
      process.env.NEXT_PUBLIC_STORAGE_BUCKET_HOSTNAME,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CHARGILY_PUBLIC_KEY:
      process.env.NEXT_PUBLIC_CHARGILY_PUBLIC_KEY,
  },

  /**
   * Skip validation during Docker/CI builds if variables are injected dynamically.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
