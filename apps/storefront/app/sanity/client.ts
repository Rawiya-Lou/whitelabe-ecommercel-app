import { createClient } from "next-sanity";
import { env } from "../env.mjs";



export const sanityClient = createClient({
  projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: env.NEXT_PUBLIC_SANITY_DATASET,
  apiVersion: "2026-08-01",
  useCdn: process.env.NODE_ENV === "production",
  token: env.SANITY_API_READ_TOKEN,
});