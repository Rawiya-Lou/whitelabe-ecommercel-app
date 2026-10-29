import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { POST } from "../route";

const mockWorkflowRun = vi.fn();
vi.mock("../../../workflows/sanity-sync", () => ({
  sanitySyncProductWorkflow: vi.fn(() => ({
    run: mockWorkflowRun,
  })),
}));

vi.mock("../../../utils/sync-lock", () => ({
  syncLock: {
    isLocked: vi.fn(),
    acquire: vi.fn(),
    release: vi.fn(),
  },
}));

import { syncLock } from "../../../utils/sync-lock";

describe("Sanity Webhook Ingestion Route (POST /sanity-sync)", () => {
  const originalEnv = process.env;

  let mockLogger: any;
  let mockQueryEngine: any;
  let mockProductModuleService: any;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env = {
      ...originalEnv,
      SANITY_PROJECT_ID: "test-proj-id",
      SANITY_DATASET: "development",
      SANITY_SYNC_SECRET_TOKEN: "valid-secret-token",
      NODE_ENV: "test",
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockQueryEngine = {
      graph: vi.fn(),
    };

    mockProductModuleService = {
      listProductCategories: vi.fn(),
      createProductCategories: vi.fn(),
      updateProductCategories: vi.fn(),
    };

    mockReq = {
      headers: {
        "x-sanity-sync-token": "valid-secret-token",
      },
      query: {},
      body: {},
      scope: {
        resolve: vi.fn((key: string) => {
          if (key === ContainerRegistrationKeys.LOGGER) return mockLogger;
          if (key === ContainerRegistrationKeys.QUERY) return mockQueryEngine;
          if (key === Modules.PRODUCT) return mockProductModuleService;
          return null;
        }),
      },
      _releaseSyncLock: vi.fn(),
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    vi.mocked(syncLock.isLocked).mockResolvedValue(false);
    vi.mocked(syncLock.acquire).mockResolvedValue(undefined);
    vi.mocked(syncLock.release).mockResolvedValue(undefined);

    mockWorkflowRun.mockResolvedValue({
      result: { success: true, operation: "updated" },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Security & Authentication", () => {
    it("should return 401 Unauthorized if auth token is missing", async () => {
      mockReq.headers["x-sanity-sync-token"] = undefined;

      await POST(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.send).toHaveBeenCalledWith("Unauthorized");
    });

    it("should return 401 Unauthorized if auth token does not match secret", async () => {
      mockReq.headers["x-sanity-sync-token"] = "wrong-token";

      await POST(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.send).toHaveBeenCalledWith("Unauthorized");
    });

    it("should return 500 if SANITY_PROJECT_ID is missing", async () => {
      delete process.env.SANITY_STUDIO_PROJECT_ID;
      delete process.env.SANITY_PROJECT_ID;

      mockReq.body = { _type: "product", _id: "prod_1" };

      await POST(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) }),
      );
    });
  });

  describe("Loop Guards & Concurrency", () => {
    it("should bypass and ignore Medusa background event loop echoes", async () => {
      mockReq.body = {
        event: "product.updated",
        _id: "prod_123",
      };

      await POST(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ syncStatus: "ignored" }),
      );
      expect(mockWorkflowRun).not.toHaveBeenCalled();
    });

    it("should block echo if the mutation originated from Medusa (medusa-sync lock active)", async () => {
      mockReq.body = {
        _id: "doc_test_123",
        _type: "product",
        title: "Test Kaftan",
      };

      vi.mocked(syncLock.isLocked).mockImplementation(async (key: string) => {
        return key === "medusa-sync:doc_test_123";
      });

      await POST(mockReq, mockRes);

      expect(syncLock.release).toHaveBeenCalledWith("medusa-sync:doc_test_123");
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: "Loop echo blocked",
      });
      expect(mockWorkflowRun).not.toHaveBeenCalled();
    });
  });

  describe("Draft Staging & Perspectives", () => {
    it("should defer draft documents with 202 Accepted", async () => {
      mockReq.body = {
        _id: "drafts.doc_123",
        _type: "product",
        title: "Staging Draft Product",
      };

      await POST(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(202);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          syncStatus: "deferred",
          sanityDocumentId: "doc_123",
        }),
      );
      expect(mockWorkflowRun).not.toHaveBeenCalled();
    });

    it("should drop invalid non-published perspectives with 200 Ignored", async () => {
      mockReq.body = {
        _id: "doc_123",
        _type: "product",
        _perspectives: ["previewDrafts"],
      };

      await POST(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          syncStatus: "ignored",
          message: expect.stringContaining(
            "exclusively locked to Published perspectives",
          ),
        }),
      );
    });
  });

  describe("Category Sync Handlers", () => {
    it("should spawn a new category if it does not exist in Medusa", async () => {
      mockReq.body = {
        _type: "category",
        _id: "cat_summer_collection",
        title: "Summer Collection",
        slug: { current: "summer-collection" },
      };

      mockProductModuleService.listProductCategories.mockResolvedValue([]);

      await POST(mockReq, mockRes);

      expect(
        mockProductModuleService.createProductCategories,
      ).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "Summer Collection",
          handle: "summer-collection",
          is_active: true,
          metadata: expect.objectContaining({
            sanity_id: "cat_summer_collection",
          }),
        }),
      ]);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Category sync complete" }),
      );
    });

    it("should block category deletion if category has active products", async () => {
      mockReq.body = {
        documentType: "category",
        action: "delete",
        _id: "cat_active_123",
        slug: "active-category",
      };

      mockQueryEngine.graph.mockResolvedValue({
        data: [
          {
            id: "pcat_123",
            handle: "active-category",
            products: [{ id: "prod_1" }],
          },
        ],
      });

      await POST(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining(
          "Cannot delete a category with assigned products",
        ),
      });
      expect(mockWorkflowRun).not.toHaveBeenCalled();
    });
  });

  describe("Product Deletion Handler", () => {
    it("should intercept and block delete echo if medusa-delete lock is active", async () => {
      mockReq.body = {
        _id: "doc_prod_to_delete",
        documentType: "product",
        action: "delete",
      };

      vi.mocked(syncLock.isLocked).mockImplementation(async (key: string) => {
        return key === "medusa-delete:doc_prod_to_delete";
      });

      await POST(mockReq, mockRes);

      expect(syncLock.release).toHaveBeenCalledWith(
        "medusa-delete:doc_prod_to_delete",
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: "Deletion echo blocked",
      });
      expect(mockWorkflowRun).not.toHaveBeenCalled();
    });

    it("should lock target product and dispatch delete workflow when product exists", async () => {
      mockReq.body = {
        _id: "doc_to_purge",
        documentType: "product",
        action: "delete",
      };

      mockQueryEngine.graph.mockResolvedValue({
        data: [{ id: "prod_medusa_999", handle: "purge-me" }],
      });

      await POST(mockReq, mockRes);

      expect(syncLock.acquire).toHaveBeenCalledWith(
        "sanity-delete:prod_medusa_999",
        15,
      );
      expect(mockWorkflowRun).toHaveBeenCalledWith({
        input: expect.objectContaining({
          operation: "delete",
          documentType: "product",
          deletionTargetId: "prod_medusa_999",
        }),
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });

  describe("Product Ingestion & Multilingual Sync", () => {
    it("should return 400 if product does not resolve to an existing Medusa category", async () => {
      mockReq.body = {
        _id: "prod_no_cat",
        _type: "product",
        title: "Product Without Category",
        categories: [],
      };

      await POST(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining(
            "references an existing Medusa category",
          ),
        }),
      );
    });

    it("should successfully extract multilingual titles/descriptions, acquire locks, and execute workflow", async () => {
      mockReq.body = {
        _id: "4a21732e-478b-4fc2-9d63-0c01c91dd461",
        _type: "product",
        title: {
          en: "Lajavel Perfume",
          fr: "Parfum Lajavel",
          ar: "عطر لاجافيل",
        },
        description: {
          en: "Artisanal citrus perfume.",
          fr: "Parfum artisanal aux agrumes.",
          ar: "عطر حمضيات حرفي فاخر.",
        },
        slug: { current: "lajavel-perfume" },
        categories: [{ _ref: "cat_perfumes" }],
        images: [
          {
            url: "https://cdn.sanity.io/images/test/dev/perfume.jpg",
            alt_en: "Bottle Front",
            alt_fr: "Bouteille Face",
            alt_ar: "الزجاجة من الأمام",
          },
        ],
      };

      mockQueryEngine.graph.mockImplementation(async ({ entity }: any) => {
        if (entity === "product_category") {
          return {
            data: [
              { id: "pcat_perfumes_123", handle: "perfumes", name: "Perfumes" },
            ],
          };
        }
        if (entity === "product") {
          return {
            data: [{ id: "prod_01M5W9PXA9VBPRR94689HBEGDX" }],
          };
        }
        return { data: [] };
      });

      await POST(mockReq, mockRes);

      // Verify lock acquired for Medusa product ID
      expect(syncLock.acquire).toHaveBeenCalledWith(
        "sanity-sync:prod_01M5W9PXA9VBPRR94689HBEGDX",
        15,
      );

      // Verify standardized payload passed to workflow
      expect(mockWorkflowRun).toHaveBeenCalledWith({
        input: expect.objectContaining({
          operation: "create",
          documentType: "product",
          categoryIds: ["pcat_perfumes_123"],
          productData: expect.objectContaining({
            _id: "4a21732e-478b-4fc2-9d63-0c01c91dd461",
            title: "Lajavel Perfume",
            subtitle: "Parfum Lajavel",
            description: "Artisanal citrus perfume.",
            slug: "lajavel-perfume",
            metadata: expect.objectContaining({
              sanity_id: "4a21732e-478b-4fc2-9d63-0c01c91dd461",
              title_en: "Lajavel Perfume",
              title_fr: "Parfum Lajavel",
              title_ar: "عطر لاجافيل",
              description_en: "Artisanal citrus perfume.",
              description_fr: "Parfum artisanal aux agrumes.",
              description_ar: "عطر حمضيات حرفي فاخر.",
              translations: {
                en: {
                  title: "Lajavel Perfume",
                  description: "Artisanal citrus perfume.",
                },
                fr: {
                  title: "Parfum Lajavel",
                  description: "Parfum artisanal aux agrumes.",
                },
                ar: {
                  title: "عطر لاجافيل",
                  description: "عطر حمضيات حرفي فاخر.",
                },
              },
            }),
          }),
        }),
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          medusaOperation: "updated",
        }),
      );
    });
  });
});
