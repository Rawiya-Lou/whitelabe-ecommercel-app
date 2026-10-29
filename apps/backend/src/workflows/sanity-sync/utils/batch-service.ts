import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import {
  IProductModuleService,
  IInventoryService,
  Logger,
} from "@medusajs/framework/types";
import { mapSanityToMedusaProduct } from "./mappers";
import { SanityProductPayload } from "../types";

interface BatchSyncConfig {
  categoryIds: string[];
  shippingProfileId?: string;
  salesChannelId?: string;
  stockLocationId?: string;
}

interface BatchSyncResult {
  created: number;
  inventoryLinked: number;
  failures: { id: string; error: string }[];
}

interface InjectedDependencies {
  [Modules.PRODUCT]: IProductModuleService;
  [Modules.INVENTORY]: IInventoryService;
  remoteLink: any;
  [ContainerRegistrationKeys.LOGGER]: Logger;
}

export class SanityMedusaSyncService {
  protected container: InjectedDependencies;

  constructor(container: InjectedDependencies) {
    this.container = container;
  }

  async batchSyncProducts(
    sanityProducts: (SanityProductPayload & {
      stockQuantity?: number;
      manage_inventory?: boolean;
    })[],
    config: BatchSyncConfig,
    batchSize = 20,
  ): Promise<BatchSyncResult> {
    const productModuleService = this.container[
      Modules.PRODUCT
    ] as IProductModuleService;
    const inventoryModuleService = this.container[
      Modules.INVENTORY
    ] as IInventoryService;
    const remoteLinkService = this.container.remoteLink;
    const logger = this.container[ContainerRegistrationKeys.LOGGER] as Logger;

    const executionResults: BatchSyncResult = {
      created: 0,
      inventoryLinked: 0,
      failures: [],
    };

    for (let i = 0; i < sanityProducts.length; i += batchSize) {
      const batchChunk = sanityProducts.slice(i, i + batchSize);

      await Promise.all(
        batchChunk.map(async (sanityProd) => {
          try {
            const medusaPayload = mapSanityToMedusaProduct(
              sanityProd,
              config.categoryIds,
              config.shippingProfileId,
              config.salesChannelId,
            );

            const cleanImagesArray = Array.isArray(medusaPayload.images)
              ? medusaPayload.images.map((img: any) => ({
                  url: img.url,
                }))
              : [];

            const rawOrigin =
              sanityProd.originCountry || (sanityProd as any).origin_country;
            const validOriginCountry =
              rawOrigin &&
              typeof rawOrigin === "string" &&
              rawOrigin.trim().length === 2
                ? rawOrigin.trim().toLowerCase()
                : "dz";

            const rawMaterial = sanityProd.material;
            const materialStr =
              typeof rawMaterial === "string"
                ? rawMaterial
                : (rawMaterial as any)?.en ||
                  (rawMaterial as any)?.fr ||
                  undefined;

            const { tags: _, ...safeProductCreatePayload } =
              medusaPayload as any;

            const createdProducts = await productModuleService.createProducts([
              {
                ...safeProductCreatePayload,
                origin_country: validOriginCountry,
                thumbnail:
                  medusaPayload.thumbnail ||
                  cleanImagesArray[0]?.url ||
                  undefined,
                images: cleanImagesArray,
              },
            ]);
            const targetProduct = createdProducts?.[0];

            if (!targetProduct) {
              throw new MedusaError(
                MedusaError.Types.DB_ERROR,
                "Failed to initialize base product row entry.",
              );
            }
            executionResults.created++;

            let variant = targetProduct.variants?.[0];
            if (!variant) {
              const [refetched] = await productModuleService.listProducts(
                { id: targetProduct.id },
                { relations: ["variants"] },
              );
              variant = refetched?.variants?.[0];
            }

            if (variant && cleanImagesArray.length > 0) {
              const variantMediaUrls =
                sanityProd.images && sanityProd.images.length > 0
                  ? sanityProd.images.map((img: any) => img.url).filter(Boolean)
                  : cleanImagesArray.map((img) => img.url);

              if (variantMediaUrls.length > 0) {
                await productModuleService.updateProducts(targetProduct.id, {
                  variants: [
                    {
                      id: variant.id,
                      metadata: {
                        ...(variant.metadata || {}),
                        variant_images: variantMediaUrls.map((url) => ({
                          url,
                        })),
                      },
                    },
                  ],
                });
              }
            }

            const shouldManageInventory = sanityProd.manage_inventory ?? true;

            if (variant && shouldManageInventory && config.stockLocationId) {
              const createdInventoryItems =
                await inventoryModuleService.createInventoryItems([
                  {
                    sku: variant.sku,
                    origin_country: validOriginCountry,
                    material: materialStr,
                    requires_shipping: true,
                    weight: sanityProd.weightGrams
                      ? parseFloat(sanityProd.weightGrams.toString())
                      : 0,
                    length: sanityProd.lengthMm
                      ? parseFloat(sanityProd.lengthMm.toString())
                      : 0,
                    width: sanityProd.widthMm
                      ? parseFloat(sanityProd.widthMm.toString())
                      : 0,
                    height: sanityProd.heightMm
                      ? parseFloat(sanityProd.heightMm.toString())
                      : 0,
                  },
                ]);

              const inventoryItem = createdInventoryItems?.[0];
              if (!inventoryItem) {
                throw new MedusaError(
                  MedusaError.Types.DB_ERROR,
                  `Inventory item construction aborted for SKU: [${variant.sku}]`,
                );
              }

              await remoteLinkService.create({
                [Modules.PRODUCT]: { variant_id: variant.id },
                [Modules.INVENTORY]: { inventory_item_id: inventoryItem.id },
              });

              const stockQty =
                sanityProd.stockQuantity !== undefined
                  ? sanityProd.stockQuantity
                  : 0;

              await inventoryModuleService.createInventoryLevels([
                {
                  inventory_item_id: inventoryItem.id,
                  location_id: config.stockLocationId,
                  stocked_quantity: stockQty,
                },
              ]);

              executionResults.inventoryLinked++;
            }
          } catch (error: unknown) {
            const errMsg =
              error instanceof Error ? error.message : String(error);
            logger.error(
              `Batch Ingestion Failure on item [${sanityProd._id}]: ${errMsg}`,
            );
            executionResults.failures.push({
              id: sanityProd._id,
              error: errMsg,
            });
          }
        }),
      );
    }

    return executionResults;
  }
}
