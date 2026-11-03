import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { POST } from "../route";

const mockWorkflowRun = vi.fn();
const mockCategoryWorkflowRun = vi.fn();
vi.mock("../../../workflows/sanity-sync", () => ({
  sanitySyncProductWorkflow: vi.fn(() => ({
    run: mockWorkflowRun,
  })),
}));

vi.mock("../../../workflows/sanity-sync/category-workflow", () => ({
  sanitySyncCategoryWorkflow: vi.fn(() => ({
    run: mockCategoryWorkflowRun,
  })),
}));

vi.mock("../../../utils/sync-lock", () => ({
  syncLock: {
    isLocked: vi.fn(),
    acquire: vi.fn(),
    release: vi.fn(),
    complete: vi.fn(),
    matches: vi.fn(),
    mark: vi.fn(),
    consume: vi.fn(),
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
        "x-sanity-sync-token": "",
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
    let requestBody: unknown;
    Object.defineProperty(mockReq, "body", {
      get: () => requestBody,
      set: (body: unknown) => {
        requestBody = body;
        const serializedBody = JSON.stringify(body);
        mockReq.rawBody = Buffer.from(serializedBody);
        mockReq.headers["x-sanity-sync-token"] = "valid-secret-token";
      },
    });
    mockReq.body = {};

    mockRes = {
      status: vi.fn(function (this: any, statusCode: number) {
        this.statusCode = statusCode;
        return this;
      }),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    vi.mocked(syncLock.isLocked).mockResolvedValue(false);
    vi.mocked(syncLock.matches).mockResolvedValue(false);
    vi.mocked(syncLock.acquire).mockResolvedValue("lease-token");
    vi.mocked(syncLock.release).mockResolvedValue(undefined);
    vi.mocked(syncLock.complete).mockResolvedValue(undefined);
    vi.mocked(syncLock.mark).mockResolvedValue(undefined);
    vi.mocked(syncLock.consume).mockResolvedValue(undefined);

    mockWorkflowRun.mockResolvedValue({
      result: { success: true, operation: "updated" },
    });
    mockCategoryWorkflowRun.mockResolvedValue({
      result: { id: "pcat_test", created: true },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Security & Authentication", () => {
    it("should return 401 Unauthorized if auth token is missing", async () => {
      mockReq.headers["x-sanity-sync-token"] = undefined;
      mockReq.headers["sanity-webhook-signature"] = undefined;

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

    it("should accept the configured x-sanity-sync-token directly", async () => {
      mockReq.body = {
        event: "product.updated",
        _id: "prod_123",
      };

      await POST(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ syncStatus: "ignored" }),
      );
    });

    it("should accept a correctly signed Sanity webhook signature", async () => {
      const serializedBody = JSON.stringify({
        event: "product.updated",
        _id: "prod_123",
      });
      mockReq.body = JSON.parse(serializedBody);
      mockReq.headers["x-sanity-sync-token"] = undefined;
      mockReq.headers["sanity-webhook-signature"] = createHmac(
        "sha256",
        "valid-secret-token",
      )
        .update(serializedBody)
        .digest("hex");

      await POST(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ syncStatus: "ignored" }),
      );
    });

    it("should acknowledge Medusa-originated webhook echoes using the marker", async () => {
      vi.mocked(syncLock.consume).mockResolvedValueOnce("correlation-id");
      mockReq.body = {
        _id: "product_doc",
        _type: "product",
      };

      await POST(mockReq, mockRes);

      expect(syncLock.consume).toHaveBeenCalledWith(
        "sanity-echo:product_doc",
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          syncStatus: "ignored",
          message: "Acknowledged Medusa-originated Sanity mutation.",
        }),
      );
      expect(mockWorkflowRun).not.toHaveBeenCalled();
    });

    it("should reject a body changed after its signature was generated", async () => {
      mockReq.body = {
        _id: "doc_signed",
        _type: "product",
      };
      mockReq.headers["sanity-webhook-signature"] = createHmac(
        "sha256",
        "valid-secret-token",
      )
        .update(mockReq.rawBody)
        .digest("hex");
      mockReq.headers["x-sanity-sync-token"] = undefined;
      mockReq.rawBody = Buffer.from('{"_id":"doc_forged","_type":"product"}');

      await POST(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockWorkflowRun).not.toHaveBeenCalled();
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

    describe("Idempotency", () => {
      it("should acknowledge a repeated identical payload without rerunning workflows", async () => {
        mockReq.body = {
          _type: "category",
          _id: "cat_idempotent",
          title: "Idempotent",
          slug: { current: "idempotent" },
        };
        mockReq.headers["sanity-webhook-id"] = "hook-config-id";
        vi.mocked(syncLock.matches)
          .mockResolvedValueOnce(false)
          .mockResolvedValueOnce(true);

        await POST(mockReq, mockRes);
        expect(mockCategoryWorkflowRun).toHaveBeenCalledTimes(1);

        mockRes.statusCode = 200;
        await POST(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenLastCalledWith(200);
        expect(mockRes.json).toHaveBeenLastCalledWith(
          expect.objectContaining({ syncStatus: "unchanged" }),
        );
        expect(mockCategoryWorkflowRun).toHaveBeenCalledTimes(1);
      });

      it("should process later revisions delivered by the same Sanity webhook", async () => {
        mockReq.headers["sanity-webhook-id"] = "same-hook-configuration";
        mockReq.body = {
          _type: "category",
          _id: "cat_later_revision",
          _rev: "revision-1",
          title: "First title",
          slug: { current: "later-revision" },
        };
        await POST(mockReq, mockRes);

        mockReq.body = {
          _type: "category",
          _id: "cat_later_revision",
          _rev: "revision-2",
          title: "Updated title",
          slug: { current: "later-revision" },
        };
        mockRes.statusCode = 200;
        await POST(mockReq, mockRes);

        expect(mockCategoryWorkflowRun).toHaveBeenCalledTimes(2);
        expect(mockRes.status).toHaveBeenLastCalledWith(200);
      });
    });

    describe("Batch ingestion", () => {
      it("should route category batches through the category workflow", async () => {
        mockReq.body = {
          operation: "batch",
          documentType: "category",
          batchCategories: [
            {
              _id: "cat_batch_1",
              title: { en: "Batch category" },
              slug: { current: "batch-category" },
            },
          ],
        };

        await POST(mockReq, mockRes);

        expect(mockCategoryWorkflowRun).toHaveBeenCalledWith(
          expect.objectContaining({
            input: expect.objectContaining({
              sanityId: "cat_batch_1",
              handle: "batch-category",
            }),
          }),
        );
        expect(mockRes.status).toHaveBeenCalledWith(200);
      });

      it("should route product batches through the inbound product workflow", async () => {
        mockReq.body = {
          operation: "batch",
          documentType: "product",
          batchProducts: [
            {
              _id: "prod_batch_1",
              title: { en: "Batch product" },
              slug: { current: "batch-product" },
              categories: [{ _ref: "cat_batch_1" }],
            },
          ],
        };
        mockQueryEngine.graph.mockResolvedValue({
          data: [{ id: "pcat_batch_1", handle: "batch-category", name: "Batch category" }],
        });

        await POST(mockReq, mockRes);

        expect(mockWorkflowRun).toHaveBeenCalledWith({
          input: expect.objectContaining({
            operation: "create",
            productData: expect.objectContaining({
              _id: "prod_batch_1",
              slug: "batch-product",
            }),
          }),
        });
        expect(mockRes.status).toHaveBeenCalledWith(200);
      });
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

    it("should ignore recent Medusa-originated webhook echoes", async () => {
      vi.mocked(syncLock.consume).mockResolvedValueOnce("correlation-id");
      mockReq.body = {
        _id: "cat_test_123",
        _type: "category",
        documentType: "category",
        updatedBy: "medusa",
        title: "Medusa category",
        slug: "medusa-category",
      };

      await POST(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        syncStatus: "ignored",
        message: "Acknowledged Medusa-originated Sanity mutation.",
      });
      expect(syncLock.consume).toHaveBeenCalledWith(
        "sanity-echo:cat_test_123",
      );
      expect(mockCategoryWorkflowRun).not.toHaveBeenCalled();
      expect(mockWorkflowRun).not.toHaveBeenCalled();
    });

    it("should process a later product edit despite a stale Medusa origin marker", async () => {
      mockReq.body = {
        _id: "sanity-product-stale-origin",
        _type: "product",
        updatedBy: "medusa",
        title: { en: "Human edited product" },
        slug: { current: "human-edited-product" },
        categories: [{ _ref: "cat_existing" }],
      };
      mockQueryEngine.graph.mockImplementation(async ({ entity }: any) => {
        if (entity === "product_category") {
          return {
            data: [
              {
                id: "pcat_existing",
                handle: "existing",
                name: "Existing",
              },
            ],
          };
        }
        return { data: [] };
      });

      await POST(mockReq, mockRes);

      expect(mockWorkflowRun).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            productData: expect.objectContaining({
              title: "Human edited product",
            }),
          }),
        }),
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("should not block a Sanity update because a recent outbound marker exists", async () => {
      mockReq.body = {
        _id: "cat_recent_outbound",
        _type: "category",
        documentType: "category",
        updatedBy: "sanity",
        title: "Updated from Sanity",
        slug: "updated-from-sanity",
      };
      vi.mocked(syncLock.isLocked).mockResolvedValue(true);

      await POST(mockReq, mockRes);

      expect(mockCategoryWorkflowRun).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            sanityId: "cat_recent_outbound",
            handle: "updated-from-sanity",
          }),
        }),
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Category sync complete" }),
      );
      expect(syncLock.isLocked).not.toHaveBeenCalled();
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

      expect(mockCategoryWorkflowRun).toHaveBeenCalledWith({
        input: expect.objectContaining({
          name: "Summer Collection",
          handle: "summer-collection",
          metadata: expect.objectContaining({
            sanity_id: "cat_summer_collection",
          }),
        }),
      });
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

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: "Cannot delete a category with assigned products",
      });
      expect(mockWorkflowRun).not.toHaveBeenCalled();
    });
  });

  describe("Product Deletion Handler", () => {
    it("should dispatch a valid delete while a recent outbound marker exists", async () => {
      mockReq.body = {
        _id: "doc_prod_to_delete",
        documentType: "product",
        action: "delete",
      };
      vi.mocked(syncLock.isLocked).mockResolvedValue(true);
      mockQueryEngine.graph.mockResolvedValue({
        data: [{ id: "prod_to_delete", handle: "product-to-delete" }],
      });

      await POST(mockReq, mockRes);

      expect(mockWorkflowRun).toHaveBeenCalledWith({
        input: expect.objectContaining({
          operation: "delete",
          documentType: "product",
          deletionTargetId: "prod_to_delete",
        }),
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(syncLock.isLocked).not.toHaveBeenCalled();
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
        expect.stringMatching(/^sanity-event:/),
        86400,
      );
      expect(syncLock.acquire).toHaveBeenCalledWith(
        "sanity-sync:product-doc_to_purge",
        120,
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
            "existing Medusa category",
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
        tags: ["Handmade", "Citrus"],
        variants: [
          {
            _key: "variant-lajavel",
            title: "Lajavel Standard",
            options: [{ option: "Size", value: "Standard" }],
            images: [
              {
                _key: "variant-lajavel-image",
                asset: { _ref: "image-asset-dimensions-jpg" },
                alt: { en: "Variant bottle" },
              },
            ],
          },
        ],
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
        "sanity-sync:product-4a21732e-478b-4fc2-9d63-0c01c91dd461",
        120,
      );

      // Verify standardized payload passed to workflow
      expect(mockWorkflowRun).toHaveBeenCalledWith({
        input: expect.objectContaining({
          operation: "update",
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
              tags: ["Handmade", "Citrus"],
              variant_images: expect.objectContaining({
                "variant-lajavel": [
                  expect.objectContaining({
                    url: expect.stringContaining("cdn.sanity.io/images"),
                    alt: expect.objectContaining({ en: "Variant bottle" }),
                  }),
                ],
              }),
              title_en: "Lajavel Perfume",
              title_fr: "Parfum Lajavel",
              title_ar: "عطر لاجافيل",
              description_en: "Artisanal citrus perfume.",
              description_fr: "Parfum artisanal aux agrumes.",
              description_ar: "عطر حمضيات حرفي فاخر.",
              translations: expect.objectContaining({
                en: expect.objectContaining({
                  title: "Lajavel Perfume",
                  description: "Artisanal citrus perfume.",
                }),
                fr: expect.objectContaining({
                  title: "Parfum Lajavel",
                  description: "Parfum artisanal aux agrumes.",
                }),
                ar: expect.objectContaining({
                  title: "عطر لاجافيل",
                  description: "عطر حمضيات حرفي فاخر.",
                }),
              }),
            }),
            variants: [
              expect.objectContaining({
                _key: "variant-lajavel",
                options: [{ option: "Size", value: "Standard" }],
                images: [
                  expect.objectContaining({
                    url: expect.stringContaining("cdn.sanity.io/images"),
                  }),
                ],
              }),
            ],
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

    it("merges partial productData projections and preserves localized images and empty optional values", async () => {
      mockReq.body = {
        _id: "sanity-product-projection",
        _type: "product",
        title: { en: "Root product title" },
        description: { en: "" },
        material: { en: "" },
        slug: { current: "projection-product" },
        categories: [{ _ref: "cat_projection" }],
        images: [
          {
            _key: "image-key",
            asset: { _ref: "image-asset-dimensions-jpg" },
            alt: {
              en: "Front",
              fr: "Devant",
              ar: "أمام",
            },
          },
        ],
        productData: {
          title: { en: "Nested product title" },
          metadata: {
            translations: {
              en: {
                description: "stale description",
                material: "stale material",
              },
            },
          },
        },
      };
      mockQueryEngine.graph.mockImplementation(async ({ entity }: any) => {
        if (entity === "product_category") {
          return {
            data: [
              {
                id: "pcat_projection",
                handle: "projection",
                name: "Projection",
              },
            ],
          };
        }
        return { data: [] };
      });

      await POST(mockReq, mockRes);

      expect(mockWorkflowRun).toHaveBeenCalledWith({
        input: expect.objectContaining({
          productData: expect.objectContaining({
            title: "Nested product title",
            description: "",
            material: "",
            categories: [
              expect.objectContaining({ id: "pcat_projection" }),
            ],
            images: [
              expect.objectContaining({
                _key: "image-key",
                url: expect.stringContaining("cdn.sanity.io/images"),
                alt: "Front",
                alt_fr: "Devant",
                alt_ar: "أمام",
              }),
            ],
          }),
        }),
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("ingests Sanity projections without document type or operation headers", async () => {
      mockReq.headers["sanity-operation"] = undefined;
      mockReq.body = {
        _id: "sanity-product-minimal-projection",
        productData: {
          title: { en: "Minimal projection product" },
          slug: { current: "minimal-projection-product" },
          categories: [{ _ref: "cat_projection" }],
        },
      };
      mockQueryEngine.graph.mockImplementation(async ({ entity }: any) => {
        if (entity === "product_category") {
          return {
            data: [
              {
                id: "pcat_projection",
                handle: "projection",
                name: "Projection",
              },
            ],
          };
        }
        return { data: [] };
      });

      await POST(mockReq, mockRes);

      expect(mockWorkflowRun).toHaveBeenCalledWith({
        input: expect.objectContaining({
          operation: "create",
          documentType: "product",
          productData: expect.objectContaining({
            _id: "sanity-product-minimal-projection",
            title: "Minimal projection product",
          }),
        }),
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });
  });
});
