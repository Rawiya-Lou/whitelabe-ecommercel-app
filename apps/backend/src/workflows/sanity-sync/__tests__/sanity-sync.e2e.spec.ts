import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { loadEnv } from "@medusajs/framework/utils";

loadEnv("test", process.cwd());

const BASE_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:9000";
const SYNC_URL = `${BASE_URL}/sanity-sync`;
const PUBLISHABLE_API_KEY =
  process.env.MEDUSA_PUBLISHABLE_KEY ||
  process.env.PUBLISH_KEY ||
  "pk_test_placeholder";
const VALID_SECRET = process.env.SANITY_SYNC_SECRET_TOKEN || "development";

interface SyncResponseDTO {
  success?: boolean;
  message?: string;
  operation?: string;
  medusaOperation?: string;
  syncStatus?: string;
  sanityDocumentId?: string;
  error?: string;
  details?: unknown;
}

function generateTestIdentity() {
  const seed = `${Math.floor(Math.random() * 1_000_000)}-${Date.now()}`;
  return {
    productId: `e2e-prod-${seed}`,
    productSlug: `e2e-desk-${seed}`,
    categoryId: `e2e-cat-${seed}`,
    categorySlug: `e2e-cat-slug-${seed}`,
  };
}

describe("Sanity CMS Sync Engine - Professional E2E Lifecycle Suite", () => {
  const identity = generateTestIdentity();

  async function dispatchWebhook(
    payload: Record<string, unknown>,
    options: {
      secret?: string | null;
      operation?: string;
      docId?: string;
      perspective?: string;
    } = {},
  ): Promise<{ status: number; data: SyncResponseDTO }> {
    const {
      secret = VALID_SECRET,
      operation = "create",
      docId,
      perspective,
    } = options;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "sanity-operation": operation,
    };

    if (secret) headers["x-sanity-sync-token"] = secret;
    if (docId) headers["sanity-document-id"] = docId;

    let targetUrl = SYNC_URL;
    if (perspective) {
      targetUrl += `?perspective=${encodeURIComponent(perspective)}`;
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    let data: SyncResponseDTO = {};
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }

    return { status: response.status, data };
  }
  beforeAll(async () => {
    const { status, data } = await dispatchWebhook(
      {
        _type: "category",
        documentType: "category",
        _id: identity.categoryId,
        title: "Sanity E2E Suite Category",
        slug: identity.categorySlug,
        _perspectives: "published",
      },
      { operation: "create", docId: identity.categoryId },
    );

    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  describe("Security & Staging Guards", () => {
    it("should reject requests when sync token is missing or invalid (401)", async () => {
      const { status, data } = await dispatchWebhook(
        { _type: "product", _id: identity.productId },
        { secret: "invalid-token" },
      );

      expect(status).toBe(401);
      expect(data.message).toContain("Unauthorized");
    });

    it("should defer unpublished draft mutations with HTTP 202", async () => {
      const draftId = `drafts.${identity.productId}`;
      const { status, data } = await dispatchWebhook(
        {
          _type: "product",
          _id: draftId,
          title: { en: "Work-in-progress Draft" },
          _perspectives: "drafts",
        },
        { operation: "update", docId: draftId },
      );

      expect(status).toBe(202);
      expect(data.success).toBe(true);
      expect(data.syncStatus).toBe("deferred");
      expect(data.sanityDocumentId).toBe(identity.productId);
    });

    it("should ignore payloads with non-standard perspectives (200 Ignored)", async () => {
      const { status, data } = await dispatchWebhook({
        _type: "product",
        _id: identity.productId,
        _perspectives: ["internal_preview_draft"],
      });

      expect(status).toBe(200);
      expect(data.syncStatus).toBe("ignored");
      expect(data.message).toContain("exclusively locked to Published");
    });

    it("should gracefully bypass background echo webhooks without errors", async () => {
      const { status, data } = await dispatchWebhook({
        event: "product.updated",
        _id: identity.productId,
      });

      expect(status).toBe(200);
      expect(data.syncStatus).toBe("ignored");
      expect(data.message).toContain("Background execution loop bypassed");
    });
  });

  describe("Category Sync Lifecycle", () => {
    it("should reject category creation if slug/handle is empty (400)", async () => {
      const { status, data } = await dispatchWebhook(
        {
          _type: "category",
          documentType: "category",
          _id: "invalid_cat_id",
          title: "Missing Handle Category",
          slug: "",
        },
        { operation: "create" },
      );

      expect(status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("handle cannot be empty");
    });

    it("should update category title and preserve metadata idempotently", async () => {
      const { status, data } = await dispatchWebhook(
        {
          _type: "category",
          documentType: "category",
          _id: identity.categoryId,
          title: { en: "Refined Luxury Furniture" },
          slug: identity.categorySlug,
          _perspectives: "published",
        },
        { operation: "update", docId: identity.categoryId },
      );

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe("Category sync complete");
    });
  });

  describe("Product Sync & Metadata Normalization", () => {
    it("should block product sync if no valid Medusa category is associated (400)", async () => {
      const orphanId = `orphan_${identity.productId}`;
      const { status, data } = await dispatchWebhook(
        {
          _type: "product",
          documentType: "product",
          _id: orphanId,
          productData: {
            _id: orphanId,
            slug: { current: `orphan-${identity.productSlug}` },
            title: { en: "Orphan Product Without Category" },
            categories: [],
          },
        },
        { operation: "create", docId: orphanId },
      );

      expect(status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("references an existing Medusa category");
    });

    it("should ingest product with multilingual fields, CDN images, and physical specs", async () => {
      const newProductPayload = {
        _type: "product",
        documentType: "product",
        _id: identity.productId,
        productData: {
          _id: identity.productId,
          slug: { current: identity.productSlug },
          title: {
            en: "Handcrafted Artisan Desk",
            fr: "Bureau Artisanal en Chêne",
            ar: "مكتب مصنوع يدويًا",
          },
          description: {
            en: "Solid oak construction with brushed brass legs.",
            fr: "Fabrication en chêne massif avec pieds en laiton brossé.",
            ar: "هيكل من خشب البلوط الصلب مع أرجل من النحاس الأصفر المصقول.",
          },
          weightGrams: 28500,
          lengthMm: 1400,
          widthMm: 700,
          heightMm: 750,
          originCountry: "DZ",
          categories: [
            {
              _type: "reference",
              _ref: identity.categoryId,
            },
          ],
          images: [
            {
              _key: "img_desk_01",
              _type: "image",
              url: "https://cdn.sanity.io/images/project/dev/desk-main-1200x800.jpg",
              alt_en: "Main angle of desk",
              alt_fr: "Vue principale du bureau",
              alt_ar: "المنظر الرئيسي للمكتب",
            },
          ],
        },
      };

      const { status, data } = await dispatchWebhook(newProductPayload, {
        operation: "create",
        docId: identity.productId,
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.operation).toBe("create");
      expect(data.medusaOperation).toMatch(/created|updated/);
    });

    it("should update product details, updating French subtitle and English description cleanly", async () => {
      const updatePayload = {
        _type: "product",
        documentType: "product",
        _id: identity.productId,
        productData: {
          _id: identity.productId,
          slug: { current: identity.productSlug },
          title: {
            en: "Artisan Solid Wood Desk (Updated Edition)",
            fr: "Bureau Artisanal en Bois Massif (Édition Modifiée)",
            ar: "مكتب خشبي صلب حرفي (نسخة معدلة)",
          },
          description: {
            en: "Updated description with premium brass fittings.",
            fr: "Description mise à jour avec finitions en laiton haut de gamme.",
            ar: "وصف محدث مع تركيبات نحاسية فاخرة.",
          },
          categories: [
            {
              _type: "reference",
              _ref: identity.categoryId,
              slug: identity.categorySlug,
            },
          ],
        },
      };

      let { status, data } = await dispatchWebhook(updatePayload, {
        operation: "update",
        docId: identity.productId,
      });

      if (data.message === "Loop echo blocked") {
        const retry = await dispatchWebhook(updatePayload, {
          operation: "update",
          docId: identity.productId,
        });
        status = retry.status;
        data = retry.data;
      }

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.operation).toBe("update");
      expect(data.medusaOperation).toBe("updated");
    });
  });
  describe("Relational Integrity & Deletion Guards", () => {
    it("should block category deletion while products are still assigned", async () => {
      const { status, data } = await dispatchWebhook(
        {
          _type: "category",
          documentType: "category",
          _id: identity.categoryId,
          action: "delete",
        },
        { operation: "delete", docId: identity.categoryId },
      );

      expect(status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.message).toContain(
        "Cannot delete a category with assigned products",
      );
    });

    it("should delete the product from Medusa cleanly", async () => {
      const { status, data } = await dispatchWebhook(
        {
          _type: "product",
          documentType: "product",
          _id: identity.productId,
          action: "delete",
        },
        { operation: "delete", docId: identity.productId },
      );

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toMatch(/Product deletion synced/i);
    });

    it("should allow category deletion now that products are unlinked", async () => {
      const { status, data } = await dispatchWebhook(
        {
          _type: "category",
          documentType: "category",
          _id: identity.categoryId,
          action: "delete",
        },
        { operation: "delete", docId: identity.categoryId },
      );

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toMatch(/Category deletion synced/i);
    });
  });

  describe("Concurrency & Race Condition Handling", () => {
    it("should process concurrent mutations targeting separate items without lock contention", async () => {
      const batchSeed = `${Math.floor(Math.random() * 10_000)}-${Date.now()}`;
      const parallelCatId = `cat-parallel-${batchSeed}`;
      const parallelCatSlug = `cat-parallel-${batchSeed}`;

      // Provision shared category
      await dispatchWebhook(
        {
          _type: "category",
          documentType: "category",
          _id: parallelCatId,
          slug: parallelCatSlug,
          title: "Concurrent Stress Category",
        },
        { operation: "create", docId: parallelCatId },
      );

      const items = ["alpha", "beta", "gamma"].map((tag) => ({
        _type: "product",
        documentType: "product",
        _id: `prod-par-${batchSeed}-${tag}`,
        productData: {
          _id: `prod-par-${batchSeed}-${tag}`,
          slug: { current: `slug-par-${batchSeed}-${tag}` },
          title: { en: `Parallel Test Item ${tag.toUpperCase()}` },
          categories: [{ _type: "reference", _ref: parallelCatId }],
        },
      }));

      // Fire all concurrently
      const responses = await Promise.all(
        items.map((item) =>
          dispatchWebhook(item, { operation: "create", docId: item._id }),
        ),
      );

      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
      }
    });
  });
});
