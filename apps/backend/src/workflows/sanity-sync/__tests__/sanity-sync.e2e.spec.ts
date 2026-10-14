import { beforeAll, describe, it, expect } from "vitest";
import { loadEnv } from "@medusajs/framework/utils";

loadEnv("test", process.cwd());

const BASE_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:9000";
const URL = `${BASE_URL}/sanity-sync`;
const BYPASS_PUBLISH_KEY =
  process.env.PUBLISH_KEY ||
  "pk_ea79ea0e54d16e2c6faf4b4bfb9049d3ad3b9a10fd7cc866d566f518f972999a";
const VALID_DEV_SECRET = process.env.SANITY_SYNC_SECRET_TOKEN || "development";

interface FlatSyncResponseDTO {
  success: boolean;
  message?: string;
  operation?: string;
  medusaOperation?: string;
  error?: string;
  details?: unknown;
}

function generateFreshTestIdentityMatrix() {
  const uniqueSeedId = Math.floor(Math.random() * 1000000) + "-" + Date.now();
  return {
    targetTestId: `vitest-prod-${uniqueSeedId}`,
    targetTestSlug: `vitest-desk-${uniqueSeedId}`,
    defaultCategoryId: `vitest-category-${uniqueSeedId}`,
    defaultCategorySlug: `vitest-category-handle-${uniqueSeedId}`,
  };
}

describe("Sanity CMS Sync Engine - E2E Lifecycle Matrix Suite", () => {
  let targetTestId: string;
  let targetTestSlug: string;
  let defaultCategoryId: string;
  let defaultCategorySlug: string;
  let defaultProductCategories: Array<{ _type: string; _ref: string }>;

  // Helper macro to execute clean HTTP testing requests natively inside node environment
  async function dispatchSyncWebhook(
    payload: Record<string, unknown>,
    secretHeader: string | null = VALID_DEV_SECRET,
    sanityOperationHeader?: string,
    sanityDocumentIdHeader?: string,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (secretHeader) headers["x-sanity-sync-token"] = secretHeader;
    if (sanityOperationHeader) {
      headers["sanity-operation"] = sanityOperationHeader;
    }
    if (sanityDocumentIdHeader) {
      headers["sanity-document-id"] = sanityDocumentIdHeader;
    }

    return await fetch(URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  }

  beforeAll(async () => {
    const matrix = generateFreshTestIdentityMatrix();
    targetTestId = matrix.targetTestId;
    targetTestSlug = matrix.targetTestSlug;
    defaultCategoryId = matrix.defaultCategoryId;
    defaultCategorySlug = matrix.defaultCategorySlug;
    defaultProductCategories = [
      { _type: "reference", _ref: defaultCategoryId },
    ];
    const categoryResponse = await dispatchSyncWebhook(
      {
        _type: "category",
        _id: defaultCategoryId,
        title: { en: "Sanity Sync E2E Category" },
        slug: defaultCategorySlug, // Flat layout to match route category lane expectations
        _perspectives: "published",
      },
      VALID_DEV_SECRET,
      "create",
      defaultCategoryId,
    );

    expect(categoryResponse.status).toBe(200);
  });

  it("Scenario 0: returns an explicit deferred status for unpublished draft events", async () => {
    const response = await dispatchSyncWebhook(
      {
        _type: "product",
        _id: `drafts.${targetTestId}`,
        title: { en: "Unpublished product" },
        _perspectives: "drafts",
      },
      VALID_DEV_SECRET,
      "update",
      `drafts.${targetTestId}`,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      syncStatus: "deferred",
      sanityDocumentId: `${targetTestId}`,
    });
  });

  it(" Scenario 1: Should block ingestion and throw 401 if secret token signature is invalid", async () => {
    const mockPayload = {
      operation: "create",
      documentType: "product",
      _perspectives: "published",
      productData: { _id: targetTestId, slug: targetTestSlug },
    };
    const response = await dispatchSyncWebhook(
      mockPayload,
      "malicious-invalid-token-signature",
      "create",
      targetTestId,
    );

    expect(response.status).toBe(401);
    const textData = await response.text();
    expect(textData).toContain("Unauthorized");
  }, 30000);

  it(" Scenario 2: accepts authenticated server-to-server webhooks without a storefront publishable key", async () => {
    const response = await dispatchSyncWebhook(
      {
        _type: "category",
        _id: `${defaultCategoryId}-without-publishable-key`,
        title: { en: "Server-to-server category" },
        _perspectives: "published",
        slug: `${defaultCategorySlug}-without-publishable-key`,
      },
      VALID_DEV_SECRET,
      "create",
      `${defaultCategoryId}-without-publishable-key`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: "Category sync complete",
    });
  }, 30000);

  it("Scenario 3: Should perform a pristine creation pass for a new un-indexed product asset", async () => {
    const mockPayload = {
      _type: "product",
      _id: targetTestId,
      operation: "create",
      _perspectives: ["published"],
      productData: {
        title: {
          en: "Automated Vitest Test Workspace Desk",
          fr: "Bureau d'ajustement automatisé Vitest",
          ar: "مكتب اختبار ميكانيكي مطور",
        },
        slug: { current: targetTestSlug },
        basePriceDzd: 55000,
        basePriceEur: 350,
        basePriceUsd: 380,
        stockCount: 85,
        weightGrams: 42000,
        originCountry: "DZ",
        categories: defaultProductCategories,
        variants: [
          {
            sku: `SANITY-${targetTestId.toUpperCase()}`,
            title: "Default Variant",
            prices: [{ amount: 350, currency_code: "eur" }],
          },
        ],
      },
    };

    const response = await dispatchSyncWebhook(
      mockPayload,
      VALID_DEV_SECRET,
      "create",
      targetTestId,
    );

    if (response.status !== 200) {
      console.error(
        "Scenario 3 Failed. Server Response Text:",
        await response.text(),
      );
    }
    expect(response.status).toBe(200);

    const data = (await response.json()) as FlatSyncResponseDTO;

    expect(data.success).toBe(true);
    expect(data.message).toContain("complete");
    expect(data.operation).toBe("create");
    expect(data.medusaOperation).toBe("created");

    const storeResponse = await fetch(
      `${BASE_URL}/store/products?handle=${encodeURIComponent(targetTestSlug)}`,
      {
        headers: {
          "x-sanity-sync-token": VALID_DEV_SECRET,
          "x-publishable-api-key": BYPASS_PUBLISH_KEY,
        },
      },
    );
    expect(storeResponse.status).toBe(200);
  }, 30000);

  it("Scenario 4: Should parse and ingest raw Sanity CDN image references into live media array objects cleanly", async () => {
    const mockPayload = {
      _type: "product",
      _id: targetTestId,
      operation: "update",
      _perspectives: "published",
      documentType: "product",
      productData: {
        _id: targetTestId,
        slug: targetTestSlug,
        title: {
          en: "Automated Vitest Test Workspace Desk (Media Ingest Pass)",
        },
        pricing: { dzd: 55000, eur: 350, usd: 380 },
        stockCount: 85,
        categories: defaultProductCategories,

        images: [
          {
            _type: "image",
            alt: "Premium Heavy Duty Desktop Angle View",
            asset: {
              _type: "reference",
              _ref: "image-7788fa9911ccaa-1200x1200-png",
            },
          },
        ],
      },
    };
    const response = await dispatchSyncWebhook(mockPayload);

    if (response.status !== 200) {
      console.error(
        "Scenario 4 Media Ingestion Failed. Server Response Text:",
        await response.text(),
      );
    }

    expect(response.status).toBe(200);
    const data = (await response.json()) as FlatSyncResponseDTO;
    expect(data.success).toBe(true);
    expect(data.operation).toBe("update");
    expect(data.message).toContain("complete");
  }, 30000);

  it("Scenario 5: Should execute an update upsert pass and block duplicate SKU unique errors on re-publish", async () => {
    const mockPayload = {
      _type: "product",
      _id: targetTestId,
      _perspectives: "published",
      operation: "create", // Sanity defaults to emitting 'create' or root payload schemas on updates
      documentType: "product",
      productData: {
        _id: targetTestId,
        title: {
          en: "Automated Vitest Test Workspace Desk (Upgraded v2 Structural Edition)",
        },
        slug: targetTestSlug, // Matching current tracking slug handle
        pricing: { dzd: 58000, eur: 370, usd: 399 },
        stockCount: 220, // Modified inventory quantities from 85 to 220 units
        weightGrams: 42500,
        originCountry: "DZ",
        categories: defaultProductCategories,
      },
    };

    const response = await dispatchSyncWebhook(mockPayload);
    expect(response.status).toBe(200);

    const data = (await response.json()) as FlatSyncResponseDTO;
    expect(data.success).toBe(true);
    expect(data.message).toContain("complete");
    expect(data.operation).toBe("create"); // The route echoes the incoming webhook operation.
  }, 30000);

  // Scenario 6: Process Explicit Update Operations Safely
  it("Scenario 6: Should process an explicit operation type of update flawlessly", async () => {
    const mockPayload = {
      _type: "product",
      _id: targetTestId,
      operation: "update",
      _perspectives: "published",
      documentType: "product",
      productData: {
        _id: targetTestId,
        title: {
          en: "Automated Vitest Test Workspace Desk (Explicit Update Track)",
        },
        slug: targetTestSlug,
        pricing: { dzd: 62000, eur: 400, usd: 420 },
        stockCount: 310,
        weightGrams: 42500,
        originCountry: "DZ",
        categories: defaultProductCategories,
      },
    };
    const response = await dispatchSyncWebhook(
      mockPayload,
      VALID_DEV_SECRET,
      "update",
      targetTestId,
    );
    expect(response.status).toBe(200);

    const data = (await response.json()) as FlatSyncResponseDTO;
    expect(data.success).toBe(true);
    expect(data.message).toContain("complete");
  }, 30000);

  // Scenario 7: Validate System Self-Healing with isolated timestamp hooks
  it("Scenario 7: Should gracefully self-heal database routing vectors if core product rows are half-written", async () => {
    let shiftedGhostSlug = `temporary-mismatched-ghost-slug-${Date.now()}`;

    const mockPayload = {
      _type: "product",
      _id: targetTestId,
      operation: "create",
      _perspectives: "published",
      documentType: "product",
      productData: {
        _id: targetTestId,
        title: { en: "Healed Orphan Configuration Asset" },
        slug: shiftedGhostSlug,
        pricing: { dzd: 1000, eur: 10, usd: 10 },
        stockCount: 10,
        categories: defaultProductCategories,
      },
    };

    const response = await dispatchSyncWebhook(
      mockPayload,
      VALID_DEV_SECRET,
      "create",
      targetTestId,
    );
    expect(response.status).toBe(200);

    const data = (await response.json()) as FlatSyncResponseDTO;
    expect(data.success).toBe(true);
    expect(data.message).toContain("complete");
  }, 30000);

  //  Scenario 8: Validate Batch Processing Contract Lanes
  it("Scenario 8: Should parse multiple parallel catalog items cleanly down the batch import lane", async () => {
    const mockPayload = {
      operation: "batch",
      documentType: "product",
      productData: [
        {
          _id: `${targetTestId}-b1`,
          title: { en: "Bulk Asset Segment 1" },
          slug: `${targetTestSlug}-b1`,
          pricing: { dzd: 15000, eur: 100, usd: 110 },
          stockCount: 50,
          categories: [],
        },
        {
          _id: `${targetTestId}-b2`,
          title: { en: "Bulk Asset Segment 2" },
          slug: `${targetTestSlug}-b2`,
          pricing: { dzd: 22000, eur: 150, usd: 160 },
          stockCount: 75,
          categories: [],
        },
      ],
    };

    const response = await dispatchSyncWebhook(
      mockPayload,
      VALID_DEV_SECRET,
      "batch",
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as FlatSyncResponseDTO;
    expect(data.success).toBe(true);
  }, 30000);

  // Scenario 9: Validate Malformed Validation Data Fallback Errors (Strict 400 Core Rule Validation)
  it("Scenario 9: Should intercept malformed data streams, reject processing, and trigger a graceful 400 fallback", async () => {
    const localSeed = Math.floor(Math.random() * 100000);
    const malformedPayload = {
      _type: "product",
      _id: `malformed-token-${localSeed}`,
      operation: "create",
      _perspectives: "published",
      documentType: "product",
      productData: {
        _id: `malformed-token-${localSeed}`,
        slug: `malformed-slug-${localSeed}`,
        description: { en: "This transaction must drop safely." },
        pricing: { dzd: -45000, eur: -250, usd: 1 }, // Negative price payload triggers validation error
        stockCount: 10,
        originCountry: "DZ",
        categories: defaultProductCategories,
      },
    };

    const response = await dispatchSyncWebhook(
      malformedPayload,
      VALID_DEV_SECRET,
      "create",
      `malformed-token-${localSeed}`,
    );

    // Asserts your Medusa framework request validation middleware caught the broken values
    expect(response.status).toBe(400);
    const data = (await response.json()) as FlatSyncResponseDTO;
    expect(data.success).toBe(false);
  }, 30000);

  // Scenario 10: High-Traffic Parallel Request Simulation Without Row-Locking Collisions
  it("Scenario 10: Should process multiple overlapping concurrent requests in parallel without thread collisions", async () => {
    const localSeed = Math.floor(Math.random() * 100000);
    
    // 🟩 Create distinct, fully structured payloads to satisfy your Medusa validation schema fields
    const payloadA = {
      _type: "product",
      _id: `concur-a-${localSeed}`,
      operation: "create",
      _perspectives: "published",
      documentType: "product",
      productData: {
        _id: `concur-a-${localSeed}`,
        slug: { current: `concur-a-${localSeed}` }, // Correct nested schema slug object structure
        handle: `concur-a-${localSeed}`,
        title: { en: "Parallel High-Traffic Asset A" },
        basePriceDzd: 45000,
        basePriceEur: 300,
        basePriceUsd: 320,
        stockCount: 99,
        weightGrams: 1000,
        originCountry: "DZ",
        categories: defaultProductCategories,
      },
    };

    // Deep copy and vary properties cleanly for B and C to clear validation checks
    const payloadB = JSON.parse(JSON.stringify(payloadA));
    payloadB._id = `concur-b-${localSeed}`;
    payloadB.productData._id = `concur-b-${localSeed}`;
    payloadB.productData.slug.current = `concur-b-${localSeed}`;
    payloadB.productData.handle = `concur-b-${localSeed}`;
    payloadB.productData.title.en = "Parallel High-Traffic Asset B";

    const payloadC = JSON.parse(JSON.stringify(payloadA));
    payloadC._id = `concur-c-${localSeed}`;
    payloadC.productData._id = `concur-c-${localSeed}`;
    payloadC.productData.slug.current = `concur-c-${localSeed}`;
    payloadC.productData.handle = `concur-c-${localSeed}`;
    payloadC.productData.title.en = "Parallel High-Traffic Asset C";

    const workerThreads = [
      dispatchSyncWebhook(payloadA, VALID_DEV_SECRET, "create", `concur-a-${localSeed}`),
      dispatchSyncWebhook(payloadB, VALID_DEV_SECRET, "create", `concur-b-${localSeed}`),
      dispatchSyncWebhook(payloadC, VALID_DEV_SECRET, "create", `concur-c-${localSeed}`),
    ];
    
    const responses = await Promise.all(workerThreads);

    for (const res of responses) {
      if (res.status !== 200) {
        console.error("[Scenario 10 Error Log]:", await res.text());
      }
      expect(res.status).toBe(200);
      const data = (await res.json()) as FlatSyncResponseDTO;
      expect(data.success).toBe(true);
    }
  }, 60000);


  // Scenario 11: Cascading Deletion Verification Passed
  it("Scenario 11: Should trigger cascade deletion removal loops to clear down assets completely", async () => {
    const mockPayload = {
      _type: "product",
      _id: targetTestId,
      operation: "delete",
      _perspectives: "published",
    };

    const response = await dispatchSyncWebhook(
      mockPayload,
      VALID_DEV_SECRET,
      "delete",
      targetTestId,
    );
    expect(response.status).toBe(200);

    const data = (await response.json()) as FlatSyncResponseDTO;
    expect(data.success).toBe(true);

    const repeatedDelete = await dispatchSyncWebhook(
      mockPayload,
      VALID_DEV_SECRET,
      "delete",
      targetTestId,
    );
    expect(repeatedDelete.status).toBe(200);
    const repeatedData = (await repeatedDelete.json()) as FlatSyncResponseDTO;
    expect(repeatedData.success).toBe(true);
  }, 30000);

  // Scenario 12: Inventory Out-of-Stock Sync Pass Override
  it("Scenario 12: Should dynamically handle out-of-stock count sync overrides safely", async () => {
    const outOfStockPayload = {
      _type: "product",
      _id: targetTestId,
      operation: "update",
      _perspectives: "published",
      documentType: "product",
      productData: {
        _id: targetTestId,
        slug: targetTestSlug,
        title: { en: "Automated Vitest Test Workspace Desk (Sold Out State)" },
        pricing: { dzd: 62000, eur: 400, usd: 420 },
        stockCount: 0,
        categories: defaultProductCategories,
        manage_inventory: true,
        allow_backorder: false,
      },
    };
    const response = await dispatchSyncWebhook(
      outOfStockPayload,
      VALID_DEV_SECRET,
      "update",
      targetTestId,
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as FlatSyncResponseDTO;
    expect(data.success).toBe(true);
  }, 30000);

  // Scenario 13: Category Relationship Cascade Guard Blocks Removal Intercepts
  it("Scenario 13: Should block category cascade deletions if active mapped products remain", async () => {
    const localSeed = Math.floor(Math.random() * 100000);
    const occupationCategoryId = `occupied-cat-${localSeed}`;

    const categoryInitPayload = {
      _type: "category",
      _id: occupationCategoryId,
      operation: "create",
      _perspectives: "published",
      documentType: "category",
      title: { en: "Dynamic Lockdown Collection Layer" },
      slug: occupationCategoryId,
    };
    const createResponse = await dispatchSyncWebhook(
      categoryInitPayload,
      VALID_DEV_SECRET,
      "create",
      occupationCategoryId,
    );
    expect(createResponse.status).toBe(200);

    const lockPayload = {
      _type: "product",
      _id: `lock-prod-${localSeed}`,
      operation: "create",
      _perspectives: "published",
      documentType: "product",
      productData: {
        _id: `lock-prod-${localSeed}`,
        slug: `lock-slug-${localSeed}`,
        title: { en: "Category Lock Token" },
        pricing: { dzd: 1000, eur: 10, usd: 10 },
        stockCount: 1,
        categories: [{ _type: "reference", _ref: occupationCategoryId }],
      },
    };

    const prodSetupResponse = await dispatchSyncWebhook(
      lockPayload,
      VALID_DEV_SECRET,
      "create",
      `lock-prod-${localSeed}`,
    );
    expect(prodSetupResponse.status).toBe(200);

    const activeCategoryPayload = {
      _type: "category",
      _id: occupationCategoryId,
      operation: "delete",
      _perspectives: "published",
      documentType: "category",
    };

    const response = await dispatchSyncWebhook(
      activeCategoryPayload,
      VALID_DEV_SECRET,
      "delete",
      occupationCategoryId,
    );
    expect(response.status).toBe(200);

    const data = (await response.json()) as FlatSyncResponseDTO;
    // The core layer intercepts the query step and rejects deletion because the test product is still attached
    expect(data.success).toBe(false);
  }, 30000);
});
