import { describe, it, expect, beforeEach, vi } from "vitest";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

const {
  mockSystemDefaultsHandler,
  mockInspectHandler,
  mockSyncCategoriesHandler,
  mockCreateInventoryHandler,
  mockBatchSyncHandler,
  mockDeleteCatalogHandler,
  mockEnsureInventoryHandler,
  mockSyncVariantImagesHandler,
  mockResolveTagsHandler,
  mockCreateProductHandler,
  mockUpdateProductHandler,
} = vi.hoisted(() => ({
  mockSystemDefaultsHandler: vi.fn(),
  mockInspectHandler: vi.fn(),
  mockSyncCategoriesHandler: vi.fn(),
  mockCreateInventoryHandler: vi.fn(),
  mockBatchSyncHandler: vi.fn(),
  mockDeleteCatalogHandler: vi.fn(),
  mockEnsureInventoryHandler: vi.fn(),
  mockSyncVariantImagesHandler: vi.fn(),
  mockResolveTagsHandler: vi.fn(),
  mockCreateProductHandler: vi.fn(),
  mockUpdateProductHandler: vi.fn(),
}));

vi.mock("../steps/system-defaults", () => ({
  getSystemDefaultsStep: createStep(
    "get-system-defaults-mock",
    async (input) =>
      new StepResponse(
        mockSystemDefaultsHandler(input) || {
          shippingProfileId: "sp_default_123",
          salesChannelId: "sc_default_123",
          stockLocationId: "sloc_default_123",
        },
      ),
  ),
}));

vi.mock("../steps/inspect-existing-product", () => ({
  inspectExistingProductStep: createStep(
    "inspect-existing-product-mock",
    async (input) =>
      new StepResponse(mockInspectHandler(input) || { productExists: false }),
  ),
}));

vi.mock("../steps/sync-product-categories", () => ({
  syncProductCategoriesStep: createStep(
    "sync-product-categories-mock",
    async (input) =>
      new StepResponse(
        mockSyncCategoriesHandler(input) || ["pcat_verified_123"],
      ),
  ),
}));

vi.mock("../steps/create-fresh-inventory", () => ({
  createFreshInventoryStep: createStep(
    "create-fresh-inventory-mock",
    async (input) =>
      new StepResponse(
        mockCreateInventoryHandler(input) || {
          inventoryItemId: "iitem_test_123",
        },
      ),
  ),
}));

vi.mock("../steps/link-variant-to-inventory", () => ({
  linkVariantToInventoryStep: createStep(
    "link-variant-to-inventory-mock",
    async () => new StepResponse(undefined),
  ),
}));

vi.mock("../steps/ensure-product-inventory", () => ({
  ensureProductInventoryStep: createStep(
    "ensure-product-inventory-mock",
    async (input) =>
      new StepResponse(mockEnsureInventoryHandler(input) || {
        linkedVariants: 1,
      }),
  ),
}));

vi.mock("../steps/sync-variant-images-from-sanity", () => ({
  syncVariantImagesFromSanityStep: createStep(
    "sync-variant-images-from-sanity-mock",
    async (input) =>
      new StepResponse(mockSyncVariantImagesHandler(input)),
  ),
}));

vi.mock("../steps/resolve-product-tags", () => ({
  resolveProductTagsStep: createStep(
    "resolve-product-tags-mock",
    async (input: unknown) =>
      new StepResponse(
        mockResolveTagsHandler(input) ||
          (input as { values: string[] }).values.map(
            (value: string) => `ptag_${value}`,
          ),
      ),
  ),
}));

vi.mock("../steps/batch-sync-step", () => ({
  batchSyncStep: createStep(
    "batch-sync-step-mock",
    async (input) => new StepResponse(mockBatchSyncHandler(input)),
  ),
}));

vi.mock("../steps/delete-catalog-item", () => ({
  deleteCatalogItemStep: createStep(
    "delete-catalog-item-mock",
    async (input) => new StepResponse(mockDeleteCatalogHandler(input)),
  ),
}));

vi.mock("@medusajs/medusa/core-flows", async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  return {
    ...actual,
    createProductsWorkflow: {
      ...actual?.createProductsWorkflow,
      runAsStep: createStep(
        "create-products-step-mock",
        async (input) => {
          mockCreateProductHandler(input);
          return new StepResponse([]);
        },
      ),
    },
    updateProductsWorkflow: {
      ...actual?.updateProductsWorkflow,
      runAsStep: createStep(
        "update-products-step-mock",
        async (input) => {
          mockUpdateProductHandler(input);
          return new StepResponse([]);
        },
      ),
    },
    deleteProductsWorkflow: {
      ...actual?.deleteProductsWorkflow,
      hooks: {
        productsDeleted: vi.fn(),
        ...(actual?.deleteProductsWorkflow?.hooks || {}),
      },
    },
    deleteProductCategoriesWorkflow: {
      ...actual?.deleteProductCategoriesWorkflow,
      hooks: {
        categoriesDeleted: vi.fn(),
        categoryDeleted: vi.fn(),
        ...(actual?.deleteProductCategoriesWorkflow?.hooks || {}),
      },
    },
  };
});

import { sanitySyncProductWorkflow } from "../index";

describe("sanitySyncProductWorkflow Orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSystemDefaultsHandler.mockReturnValue({
      shippingProfileId: "sp_default_123",
      salesChannelId: "sc_default_123",
      stockLocationId: "sloc_default_123",
    });
    mockEnsureInventoryHandler.mockReturnValue({ linkedVariants: 1 });
    mockSyncVariantImagesHandler.mockReturnValue({ linkedImages: 0 });
    mockResolveTagsHandler.mockReset();
    mockCreateProductHandler.mockReset();
    mockUpdateProductHandler.mockReset();
  });

  it("should execute the batch lane when operation is 'batch'", async () => {
    const input: any = {
      operation: "batch",
      documentType: "product",
      batchProducts: [
        { _id: "prod_1", title: "Product 1" },
        { _id: "prod_2", title: "Product 2" },
      ],
    };

    const { result } = await sanitySyncProductWorkflow().run({
      input,
    });

    expect(result.success).toBe(true);
    expect(result.operation).toBe("batched");
  });

  it("should execute the deletion lane when operation is 'delete'", async () => {
    const input: any = {
      operation: "delete",
      documentType: "product",
      deletionTargetId: "prod_medusa_to_delete",
      productData: {
        _id: "sanity_123",
        slug: "deleted-slug",
      },
    };

    const { result } = await sanitySyncProductWorkflow().run({
      input,
    });

    expect(result.success).toBe(true);
    expect(result.operation).toBe("deleted");
  });

  it("should execute the creation branch when product does not exist in Medusa", async () => {
    mockInspectHandler.mockReturnValue({
      productExists: false,
    });

    const input: any = {
      operation: "create",
      documentType: "product",
      categoryIds: ["pcat_1"],
      productData: {
        _id: "4a21732e-fresh-uuid",
        title: "Fresh Handcrafted Plate",
        slug: "fresh-handcrafted-plate",
        tags: ["artisan"],
        images: [
          {
            _key: "variant-image",
            url: "https://cdn.sanity.io/images/test/production/variant.jpg",
          },
        ],
        variants: [
          {
            _key: "sanity-variant-1",
            title: "Large",
            options: { Size: "Large" },
            images: [
              {
                _key: "variant-image",
                url: "https://cdn.sanity.io/images/test/production/variant.jpg",
              },
            ],
            metadata: {
              variant_images: [
                {
                  url: "https://cdn.sanity.io/images/test/production/variant.jpg",
                },
              ],
            },
          },
        ],
        metadata: { translations: { en: {}, fr: {}, ar: {} } },
      },
    };

    const { result } = await sanitySyncProductWorkflow().run({
      input,
    });

    expect(result.success).toBe(true);
    expect(result.operation).toBe("created");
    expect(mockCreateProductHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          products: [
            expect.objectContaining({
              tags: [{ id: "ptag_artisan" }],
              variants: [
                expect.objectContaining({
                  metadata: expect.objectContaining({
                    sanity_variant_id: "sanity-variant-1",
                    variant_images: [
                      expect.objectContaining({
                        url: "https://cdn.sanity.io/images/test/production/variant.jpg",
                      }),
                    ],
                  }),
                }),
              ],
            }),
          ],
        },
      }),
    );
    expect(mockSyncVariantImagesHandler).toHaveBeenCalled();
  });

  it("should execute the update branch and resolve multilingual translations when product exists", async () => {
    mockInspectHandler.mockReturnValue({
      productExists: true,
      productId: "prod_medusa_existing",
      variantId: "variant_existing_123",
      inventoryItemId: "iitem_existing_123",
    });

    const input: any = {
      operation: "update",
      documentType: "product",
      categoryIds: ["pcat_1"],
      productData: {
        _id: "4a21732e-existing-uuid",
        title: {
          en: "Updated Lajavel",
          fr: "Lajavel Mis à Jour",
          ar: "عطر لاجافيل المحدث",
        },
        description: {
          en: "Updated English Description",
          fr: "Description en français",
          ar: "وصف باللغة العربية",
        },
        slug: "updated-lajavel",
        weightGrams: 300,
        metadata: {
          sanity_id: "4a21732e-existing-uuid",
          translations: { en: {}, fr: {}, ar: {} },
        },
      },
    };

    const { result } = await sanitySyncProductWorkflow().run({
      input,
    });

    expect(result.success).toBe(true);
    expect(result.operation).toBe("updated");
  });

  it("updates Sanity tags and links variant gallery images to the matching Medusa variant", async () => {
    mockInspectHandler.mockReturnValue({
      productExists: true,
      productId: "prod_existing",
      originCountry: "DZ",
      metadata: {},
      variantImageLinks: [
        { variantId: "variant_medusa", imageIds: ["image_old"] },
      ],
      variants: [
        {
          id: "variant_medusa",
          sku: "SKU-MEDUSA",
          origin_country: "DZ",
          metadata: { sanity_variant_id: "sanity-variant-key" },
          options: [{ option: { title: "Size" }, value: "Large" }],
        },
      ],
    });

    await sanitySyncProductWorkflow().run({
      input: {
        operation: "update",
        documentType: "product",
        categoryIds: ["pcat_1"],
        productData: {
          _id: "sanity-existing",
          title: "Updated Product",
          slug: "updated-product",
          material: {
            en: "Organic cotton",
            fr: "Coton biologique",
            ar: "قطن عضوي",
          },
          categories: [],
          tags: ["updated-tag"],
          images: [
            {
              _key: "variant-image",
              url: "https://cdn.sanity.io/images/test/production/variant.jpg",
            },
          ],
          variants: [
            {
              _key: "sanity-variant-key",
              variantId: "sanity-variant-key",
              images: [
                {
                  _key: "variant-image",
                  url: "https://cdn.sanity.io/images/test/production/variant.jpg",
                },
              ],
              metadata: {
                sanity_variant_content: { colorHex: "#000000" },
              },
            },
            {
              _key: "stale-sanity-variant",
              title: "Removed variant",
              images: [
                {
                  _key: "removed-variant-image",
                  url: "https://cdn.sanity.io/images/test/production/removed.jpg",
                },
              ],
            },
          ],
          syncFieldsPresent: { tags: true, images: true, variants: true },
          metadata: {
            sanity_id: "sanity-existing",
            is_sync_origin: "sanity",
            tags: ["updated-tag"],
            variant_images: {},
            translations: { en: {}, fr: {}, ar: {} },
          },
        },
      },
    });

    expect(mockUpdateProductHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          products: [
            expect.objectContaining({
              origin_country: null,
              material: "Organic cotton",
              tags: [{ id: "ptag_updated-tag" }],
              metadata: expect.objectContaining({
                material_en: "Organic cotton",
                material_fr: "Coton biologique",
                material_ar: "قطن عضوي",
                translations: expect.objectContaining({
                  en: expect.objectContaining({
                    material: "Organic cotton",
                  }),
                  fr: expect.objectContaining({
                    material: "Coton biologique",
                  }),
                  ar: expect.objectContaining({
                    material: "قطن عضوي",
                  }),
                }),
              }),
              variants: [
                expect.objectContaining({
                  id: "variant_medusa",
                  origin_country: null,
                  metadata: expect.objectContaining({
                    sanity_variant_content: { colorHex: "#000000" },
                    variant_images: [
                      expect.objectContaining({
                        url: "https://cdn.sanity.io/images/test/production/variant.jpg",
                      }),
                    ],
                  }),
                }),
              ],
            }),
          ],
        },
      }),
    );
    expect(mockSyncVariantImagesHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        productHandle: "updated-product",
        previousLinks: [
          { variantId: "variant_medusa", imageIds: ["image_old"] },
        ],
      }),
    );
  });
});
