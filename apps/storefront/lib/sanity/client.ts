import { createClient } from "@sanity/client";
import { env } from "@/app/env.mjs";

const isServer = typeof window === "undefined";

export const sanityClient = createClient({
  projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: env.NEXT_PUBLIC_SANITY_DATASET || "production",
  apiVersion: "2026-03-10", 
  useCdn: process.env.NODE_ENV === "production",
  // This keeps public frontend browser fetch bundles tokenless and secure.
  token: isServer ? process.env.SANITY_API_READ_TOKEN : undefined,
  perspective: isServer ? "published" : "raw",
});
