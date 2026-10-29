import { describe, it, expect, beforeEach, vi } from "vitest";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

const {
  mockSystemDefaultsHandler,
  mockInspectHandler,
  mockSyncCategoriesHandler,
  mockCreateInventoryHandler,
  mockBatchSyncHandler,
  mockDeleteCatalogHandler,
} = vi.hoisted(() => ({
  mockSystemDefaultsHandler: vi.fn(),
  mockInspectHandler: vi.fn(),
  mockSyncCategoriesHandler: vi.fn(),
  mockCreateInventoryHandler: vi.fn(),
  mockBatchSyncHandler: vi.fn(),
  mockDeleteCatalogHandler: vi.fn(),
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
        async () => new StepResponse([]),
      ),
    },
    updateProductsWorkflow: {
      ...actual?.updateProductsWorkflow,
      runAsStep: createStep(
        "update-products-step-mock",
        async () => new StepResponse([]),
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
        metadata: { translations: { en: {}, fr: {}, ar: {} } },
      },
    };

    const { result } = await sanitySyncProductWorkflow().run({
      input,
    });

    expect(result.success).toBe(true);
    expect(result.operation).toBe("created");
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
});
