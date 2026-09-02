import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side Environment Variables
   * These are only accessible in Next.js Server Components, API Routes, or Server Actions.
   * If accessed by the browser client, T3 Env will throw an explicit crash error.
   */
  server: {
    MEDUSA_BACKEND_URL: z.url().default("http://localhost:9000"),
    SANITY_API_READ_TOKEN: z.string().min(1).optional(),
    UPSTASH_REDIS_REST_URL: z.url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

    NODE_ENV: z.enum(["development", "test", "production"]),
  },

  client: {
    NEXT_PUBLIC_MEDUSA_BACKEND_URL: z.url().default("http://localhost:9000"),
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_SANITY_PROJECT_ID: z.string().min(1).optional(),
    NEXT_PUBLIC_SANITY_DATASET: z.string().min(1).optional(),
  },
  /**
   * Destructure all environment variables here.
   * Next.js requires explicit object mapping due to how Webpack handles dynamic lookups.
   */
  experimental__runtimeEnv: {
    // Shared / Server variables must be mapped here too
    NODE_ENV: process.env.NODE_ENV,
    MEDUSA_BACKEND_URL: process.env.MEDUSA_BACKEND_URL,
    SANITY_API_READ_TOKEN: process.env.SANITY_API_READ_TOKEN,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,

    // Client variables
    NEXT_PUBLIC_MEDUSA_BACKEND_URL: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL,
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SANITY_PROJECT_ID: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
    NEXT_PUBLIC_SANITY_DATASET: process.env.NEXT_PUBLIC_SANITY_DATASET,
  },
  // Skip validation during CI/CD steps (like Vercel build phases if needed)
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
