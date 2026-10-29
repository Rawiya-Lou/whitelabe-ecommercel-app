// import { StepResponse } from "@medusajs/framework/workflows-sdk";
// import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
// import {
//   createProductsWorkflow,
//   updateProductsWorkflow,
// } from "@medusajs/medusa/core-flows";
// import type { Logger, MedusaContainer } from "@medusajs/framework/types";
// import { SanityImagePayload } from "../types";
// import { syncLock } from "../../../utils/sync-lock";

// interface SafeSyncProduct {
//   id: string;
//   title: string;
//   handle?: string;
//   description?: string | null;
//   metadata?: Record<string, unknown> | null;
// }

// const handleProductMutation = async (
//   products: SafeSyncProduct[],
//   container: MedusaContainer,
//   actionType: "create" | "update",
// ): Promise<void> => {
//   const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
//   const sanityToken = process.env.SANITY_API_TOKEN;
//   const projectId =
//     process.env.SANITY_PROJECT_ID ||
//     process.env.SANITY_STUDIO_PROJECT_ID ||
//     "4vzx52ot";
//   const dataset =
//     process.env.SANITY_DATASET ||
//     process.env.SANITY_STUDIO_DATASET ||
//     "development";

//   if (!sanityToken || !projectId) {
//     logger.warn(
//       "[Sanity Product Sync] Integration credentials missing; skipping reverse mutations.",
//     );
//     return;
//   }

//   const productModuleService = container.resolve(Modules.PRODUCT);

//   for (const product of products) {
//     const isLockedBySanity = await syncLock.isLocked(
//       `sanity-sync:${product.id}`,
//     );
//     if (isLockedBySanity) {
//       await syncLock.release(`sanity-sync:${product.id}`);
//       logger.info(
//         `[Sanity Sync Guard] Product [${product.id}] updated by Sanity webhook. Hook bypassed.`,
//       );
//       continue;
//     }

//     const metadata = (product.metadata || {}) as Record<string, unknown>;
//     const sanityId = (metadata.sanity_id as string) || product.id;
//     const cleanSanityId = sanityId.replace(/^drafts\./, "");

//     const dbProduct = await productModuleService.retrieveProduct(product.id, {
//       relations: ["images", "categories"],
//     });

//     const dbMetadata = (dbProduct.metadata || {}) as Record<string, unknown>;
//     const translations: Record<string, any> =
//       (dbMetadata.translations as Record<string, any>) || {};

//     const localizedTitle = {
//       _type: "localizedString",
//       en: dbProduct.title || translations.en?.title || "Untitled Product",
//       fr: translations.fr?.title || "",
//       ar: translations.ar?.title || "",
//     };

//     const localizedDescription = {
//       _type: "localizedText",
//       en: dbProduct.description || translations.en?.description || "",
//       fr: translations.fr?.description || "",
//       ar: translations.ar?.description || "",
//     };

//     const categories = (dbProduct.categories || []).map((cat: any) => {
//       const refId =
//         typeof cat.metadata?.sanity_id === "string"
//           ? cat.metadata.sanity_id
//           : `category-${cat.id.replace(/_/g, "-")}`;
//       return {
//         _type: "reference",
//         _ref: String(refId).replace(/^drafts\./, ""),
//         _key: `cat_${cat.id}`,
//       };
//     });

//     const imagesMetadata = Array.isArray(dbMetadata.image_metadata)
//       ? dbMetadata.image_metadata
//       : [];

//     const formattedSanityImages = (dbProduct.images || [])
//       .map((img: any, idx: number) => {
//         const matchedMeta =
//           imagesMetadata.find((m: any) => m.url === img.url) ||
//           imagesMetadata[idx] ||
//           {};
//         const altData = matchedMeta.alt || {};

//         const imageNode: SanityImagePayload = {
//           _type: "image",
//           _key: matchedMeta.sanity_asset_id || img.id || `img_${idx}`,
//           url: img.url,
//           asset: {
//             _type: "reference",
//             _ref: matchedMeta.sanity_asset_id || "",
//           },
//           alt: img.alt || altData.en || "",
//           alt_en: altData.en || img.alt || "",
//           alt_fr: altData.fr || "",
//           alt_ar: altData.ar || "",
//         };
//         return imageNode;
//       })
//       .filter((img) => img.asset && img.asset._ref !== "");

//     await syncLock.acquire(`medusa-sync:${cleanSanityId}`, 15);
//     await syncLock.acquire(`medusa-sync:${sanityId}`, 15);

//     const mutations = [
//       {
//         createIfNotExists: {
//           _id: cleanSanityId,
//           _type: "product",
//         },
//       },
//       {
//         patch: {
//           id: cleanSanityId,
//           set: {
//             _type: "product",
//             title: localizedTitle,
//             description: localizedDescription,
//             slug: {
//               _type: "slug",
//               current: product.handle || product.id,
//             },
//             categories: categories,
//             images: formattedSanityImages,
//             medusaId: product.id,
//           },
//         },
//       },
//     ];

//     const mutationUrl = `https://${projectId}.api.sanity.io/v2021-06-07/data/mutate/${encodeURIComponent(dataset)}`;

//     try {
//       const response = await fetch(mutationUrl, {
//         method: "POST",
//         headers: {
//           Authorization: `Bearer ${sanityToken}`,
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({ mutations }),
//       });

//       if (response.ok) {
//         logger.info(
//           `[Sanity Sync Success] Synchronized product ${actionType} for [${product.title}] back to Sanity.`,
//         );
//       } else {
//         const errorPayload = await response.text();
//         logger.error(
//           `[Sanity Product Sync Error] Content Lake mutation rejected: ${errorPayload}`,
//         );
//       }
//     } catch (error) {
//       logger.error(
//         `[Sanity Sync Failure] Could not push product data back to Sanity: ${error instanceof Error ? error.message : String(error)}`,
//       );
//       await syncLock.release(`medusa-sync:${cleanSanityId}`);
//       await syncLock.release(`medusa-sync:${sanityId}`);
//     }
//   }
// };

// createProductsWorkflow.hooks.productsCreated(
//   async ({ products }, { container }) => {
//     await handleProductMutation(
//       products as SafeSyncProduct[],
//       container as any,
//       "create",
//     );
//     return new StepResponse(null);
//   },
// );

// updateProductsWorkflow.hooks.productsUpdated(
//   async ({ products }, { container }) => {
//     await handleProductMutation(
//       products as SafeSyncProduct[],
//       container as any,
//       "update",
//     );
//     return new StepResponse(null);
//   },
// );
