import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

vi.mock("../../../utils/sync-lock", () => ({
  syncLock: {
    isLocked: vi.fn(),
    acquire: vi.fn(),
    release: vi.fn(),
  },
}));

import { syncLock } from "../../../utils/sync-lock";
import syncProductCategoriesToSanity from "../sync-product-categories-to-sanity";

describe("syncProductCategoriesToSanity Subscriber", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  let mockLogger: any;
  let mockQuery: any;
  let mockProductModuleService: any;
  let mockContainer: any;
  let mockFetch: any;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env = {
      ...originalEnv,
      SANITY_PROJECT_ID: "test-project",
      SANITY_DATASET: "test-dataset",
      SANITY_API_TOKEN: "test-token",
    };

    mockFetch = vi.fn((url: string) => {
      if (url.includes("/data/query/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ result: [] }),
          text: async () => JSON.stringify({ result: [] }),
        });
      }
      if (url.includes("/data/mutate/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: [] }),
          text: async () => JSON.stringify({ results: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
        text: async () => "",
      });
    });
    global.fetch = mockFetch;

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockQuery = {
      graph: vi.fn().mockResolvedValue({ data: [] }),
    };

    mockProductModuleService = {
      updateProducts: vi.fn().mockResolvedValue({}),
    };

    mockContainer = {
      resolve: vi.fn((key: string) => {
        if (key === ContainerRegistrationKeys.LOGGER) return mockLogger;
        if (key === ContainerRegistrationKeys.QUERY) return mockQuery;
        if (key === Modules.PRODUCT) return mockProductModuleService;
        return null;
      }),
    };

    vi.mocked(syncLock.isLocked).mockResolvedValue(false);
    vi.mocked(syncLock.acquire).mockResolvedValue(undefined as any);
    vi.mocked(syncLock.release).mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  describe("Guards & Early Exits", () => {
    it("should warn and skip if SANITY_API_TOKEN or SANITY_PROJECT_ID is missing", async () => {
      delete process.env.SANITY_API_TOKEN;

      await syncProductCategoriesToSanity({
        event: { name: "product.updated", data: { id: "prod_123" } },
        container: mockContainer,
      } as any);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Credentials missing"),
      );
      expect(mockQuery.graph).not.toHaveBeenCalled();
    });

    it("should skip if target product ID is missing from event payload", async () => {
      await syncProductCategoriesToSanity({
        event: { name: "product.updated", data: {} },
        container: mockContainer,
      } as any);

      expect(mockQuery.graph).not.toHaveBeenCalled();
    });

    it("should block loop and release lock if update was triggered by Sanity (sanity-sync active)", async () => {
      vi.mocked(syncLock.isLocked).mockResolvedValue(true);

      await syncProductCategoriesToSanity({
        event: { name: "product.updated", data: { id: "prod_123" } },
        container: mockContainer,
      } as any);

      expect(syncLock.isLocked).toHaveBeenCalledWith("sanity-sync:prod_123");
      expect(syncLock.release).toHaveBeenCalledWith("sanity-sync:prod_123");
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Blocked echo back to Sanity"),
      );
      expect(mockQuery.graph).not.toHaveBeenCalled();
    });

    it("should exit cleanly if product is not found in Medusa database", async () => {
      mockQuery.graph.mockResolvedValue({ data: [] });

      await syncProductCategoriesToSanity({
        event: { name: "product.updated", data: { id: "prod_not_found" } },
        container: mockContainer,
      } as any);

      expect(mockQuery.graph).toHaveBeenCalled();
    });
  });

  describe("Product Deletion Handler (Medusa -> Sanity)", () => {
    it("should query Sanity and delete matching documents when product.deleted fires", async () => {
      mockFetch.mockImplementationOnce((url: string) => {
        if (url.includes("/data/query/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              result: [{ _id: "sanity-prod-to-delete" }],
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      await syncProductCategoriesToSanity({
        event: { name: "product.deleted", data: { id: "prod_to_delete" } },
        container: mockContainer,
      } as any);

      expect(syncLock.acquire).toHaveBeenCalledWith(
        "medusa-sync:prod_to_delete",
        20,
      );

      const mutateCall = mockFetch.mock.calls.find((call: any[]) =>
        call[0].includes("/data/mutate/"),
      );
      expect(mutateCall).toBeDefined();

      const payload = JSON.parse(mutateCall[1].body);
      expect(payload.mutations).toEqual([
        { delete: { id: "sanity-prod-to-delete" } },
      ]);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Successfully deleted 1 doc(s) in Sanity"),
      );
    });
  });

  describe("Forward Patch to Sanity", () => {
    it("should build localized payload, slug, weak categories, and patch Sanity", async () => {
      const mockProduct = {
        id: "prod-01ABC",
        title: "Lajavel Perfume",
        subtitle: "Parfum Lajavel",
        handle: "lajavel-perfume",
        description: "Artisanal citrus fragrance.",
        material: "Organic Alcohol & Oils",
        origin_country: "dz",
        tags: ["Luxury", "Organic"],
        variants: [],
        metadata: {
          sanity_id: "4a21732e-sanity-uuid",
          translations: {
            en: {
              title: "Lajavel Perfume",
              description: "Artisanal citrus fragrance.",
              material: "Organic Alcohol & Oils",
            },
            fr: {
              title: "Parfum Lajavel",
              description: "Parfum artisanal aux agrumes.",
              material: "",
            },
            ar: {
              title: "عطر لاجافيل",
              description: "عطر حمضيات حرفي",
              material: "",
            },
          },
        },
        categories: [
          {
            id: "pcat-fragrances",
            metadata: { sanity_id: "cat-fragrances-sanity" },
          },
        ],
        images: [
          {
            id: "img-1",
            url: "https://cdn.sanity.io/images/test/dev/perfume-front-300x300.jpg",
          },
        ],
      };

      mockQuery.graph.mockResolvedValue({ data: [mockProduct] });

      await syncProductCategoriesToSanity({
        event: { name: "product.updated", data: { product_id: "prod-01ABC" } },
        container: mockContainer,
      } as any);

      const mutateCall = mockFetch.mock.calls.find((call: any[]) =>
        call[0].includes("/data/mutate/"),
      );
      expect(mutateCall).toBeDefined();

      const payload = JSON.parse(mutateCall[1].body);
      const createOp = payload.mutations.find(
        (m: any) => m.createIfNotExists,
      )?.createIfNotExists;
      expect(createOp).toBeDefined();
      expect(createOp._id).toBe("4a21732e-sanity-uuid");

      const patch = payload.mutations.find((m: any) => m.patch)?.patch;
      expect(patch.id).toBe("4a21732e-sanity-uuid");

      expect(patch.set.title).toEqual({
        _type: "localizedString",
        en: "Lajavel Perfume",
        fr: "Parfum Lajavel",
        ar: "عطر لاجافيل",
      });
      expect(patch.set.description).toEqual({
        _type: "localizedText",
        en: "Artisanal citrus fragrance.",
        fr: "Parfum artisanal aux agrumes.",
        ar: "عطر حمضيات حرفي",
      });

      expect(patch.set.slug).toEqual({
        _type: "slug",
        current: "lajavel-perfume",
      });

      expect(patch.set.tags).toEqual(["Luxury", "Organic"]);

      expect(patch.set.categories).toEqual([
        {
          _type: "reference",
          _ref: "cat-fragrances-sanity",
          _key: "cat_pcat-fragrances",
          _weak: false,
        },
      ]);
    });
  });

  describe("Internal Medusa Metadata Synchronization", () => {
    it("should update Medusa's metadata.translations when product.description or title is edited in Admin", async () => {
      const mockProduct = {
        id: "prod-admin-edit",
        title: "New Admin Title",
        subtitle: "Nouveau Titre Admin",
        handle: "admin-product",
        description: "New Admin Description",
        metadata: {
          sanity_id: "sanity-doc-123",
          translations: {
            en: {
              title: "Old Title",
              description: "Old Description",
              material: "",
            },
            fr: {
              title: "Ancien Titre",
              description: "Ancienne Description",
              material: "",
            },
            ar: { title: "عنوان قديم", description: "وصف قديم", material: "" },
          },
        },
        categories: [],
        images: [],
      };

      mockQuery.graph.mockResolvedValue({ data: [mockProduct] });

      await syncProductCategoriesToSanity({
        event: { name: "product.updated", data: { id: "prod-admin-edit" } },
        container: mockContainer,
      } as any);

      expect(syncLock.acquire).toHaveBeenCalledWith(
        "sanity-sync:prod-admin-edit",
        15,
      );

      expect(mockProductModuleService.updateProducts).toHaveBeenCalledWith(
        "prod-admin-edit",
        {
          metadata: expect.objectContaining({
            translations: expect.objectContaining({
              en: {
                title: "New Admin Title",
                description: "New Admin Description",
                material: "",
              },
              fr: {
                title: "Nouveau Titre Admin",
                description: "Ancienne Description",
                material: "",
              },
              ar: {
                title: "عنوان قديم",
                description: "وصف قديم",
                material: "",
              },
            }),
            title_en: "New Admin Title",
            description_en: "New Admin Description",
            title_fr: "Nouveau Titre Admin",
          }),
        },
      );
    });
  });

  describe("Error Handling & Lock Cleanup", () => {
    it("should release medusa-sync locks if the Sanity mutation request throws an error", async () => {
      mockQuery.graph.mockResolvedValue({
        data: [
          {
            id: "prod_fail",
            handle: "fail",
            metadata: { sanity_id: "sanity_fail_doc" },
          },
        ],
      });

      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/data/query/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ result: [] }),
          });
        }
        return Promise.reject(new Error("Sanity API Network Timeout"));
      });

      await syncProductCategoriesToSanity({
        event: { name: "product.updated", data: { id: "prod_fail" } },
        container: mockContainer,
      } as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          "Sync mutation failed: Error: Sanity API Network Timeout",
        ),
      );

      expect(syncLock.release).toHaveBeenCalledWith(
        "medusa-sync:sanity_fail_doc",
      );
    });
  });
});
