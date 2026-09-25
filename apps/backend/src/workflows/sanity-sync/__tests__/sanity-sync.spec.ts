import { describe, it, expect } from "vitest";
import { loadEnv } from "@medusajs/framework/utils";

loadEnv("test", process.cwd());

const BASE_URL = "http://localhost:9000/store/sanity-sync";
const BYPASS_PUBLISH_KEY =
  "pk_ea79ea0e54d16e2c6faf4b4bfb9049d3ad3b9a10fd7cc866d566f518f972999a";
const VALID_DEV_SECRET =
  process.env.SANITY_SYNC_SECRET_TOKEN || "development-test-override-token";

interface FlatSyncResponseDTO {
  success: boolean;
  message?: string;
  operation?: string;
  error?: string;
}

describe("Sanity CMS Sync Engine - E2E Lifecycle Matrix Suite", () => {
  const uniqueSeedId = Math.floor(Math.random() * 100000);
  const targetTestId = `vitest-prod-${uniqueSeedId}`;
  const targetTestSlug = `vitest-desk-${uniqueSeedId}`;

  let shiftedGhostSlug = "";

  // Helper macro to execute clean HTTP testing requests natively inside node environment
  async function dispatchSyncWebhook(
    payload: Record<string, unknown>,
    secretHeader: string | null = VALID_DEV_SECRET,
    publishKeyHeader: string | null = BYPASS_PUBLISH_KEY,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (secretHeader) headers["x-sanity-sync-token"] = secretHeader;
    if (publishKeyHeader) headers["x-publishable-api-key"] = publishKeyHeader;

    return await fetch(BASE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  }

  it(" Scenario 1: Should block ingestion and throw 401 if secret token signature is invalid", async () => {
    const mockPayload = {
      operation: "create",
      documentType: "product",
      productData: { _id: targetTestId, slug: targetTestSlug },
    };
    const response = await dispatchSyncWebhook(
      mockPayload,
      "malicious-invalid-token-signature",
    );

    expect(response.status).toBe(401);
    const textData = await response.text();
    expect(textData).toContain("Unauthorized");
  }, 30000);

  it("Scenario 2: Should block ingestion and throw 400 if storefront publishable key is missing", async () => {
    const mockPayload = {
      operation: "create",
      documentType: "product",
      productData: { _id: targetTestId, slug: targetTestSlug },
    };
    const response = await dispatchSyncWebhook(
      mockPayload,
      VALID_DEV_SECRET,
      null,
    );

    expect(response.status).toBe(400);
  }, 30000);

  it("Scenario 3: Should perform a pristine creation pass for a new un-indexed product asset", async () => {
    const mockPayload = {
      operation: "create",
      documentType: "product",
      productData: {
        _id: targetTestId,
        title: {
          en: "Automated Vitest Test Workspace Desk",
          fr: "Bureau d'ajustement automatisé Vitest",
          ar: "مكتب اختبار ميكانيكي مطور",
        },
        slug: targetTestSlug,
        pricing: {
          dzd: 55000,
          eur: 350,
          usd: 380,
        },
        stockCount: 85,
        weightGrams: 42000,
        originCountry: "DZ",
        categories: [
          {
            _id: `cat-spec-${uniqueSeedId}`,
            slug: `spec-slug-${uniqueSeedId}`,
            title: "Automated Vitest Category",
          },
        ],
      },
    };

    const response = await dispatchSyncWebhook(mockPayload);
    if (response.status !== 200) {
      console.error(
        "Scenario 2 Failed. Server Response Text:",
        await response.text(),
      );
    }
    expect(response.status).toBe(200);

    const data = (await response.json()) as FlatSyncResponseDTO;
    console.log(data.message);
    expect(data.success).toBe(true);
    expect(data.message).toContain("complete");
    expect(data.operation).toBe("create");
  }, 30000);

  it("Scenario 4: Should parse and ingest raw Sanity CDN image references into live media array objects cleanly", async () => {
    const mockPayload = {
      operation: "update",
      documentType: "product",
      productData: {
        _id: targetTestId,
        slug: targetTestSlug,
        title: {
          en: "Automated Vitest Test Workspace Desk (Media Ingest Pass)",
        },
        pricing: { dzd: 55000, eur: 350, usd: 380 },
        stockCount: 85,
        categories: [],

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
      },
    };

    const response = await dispatchSyncWebhook(mockPayload);
    expect(response.status).toBe(200);

    const data = (await response.json()) as FlatSyncResponseDTO;
    expect(data.success).toBe(true);
    expect(data.message).toContain("complete");
    expect(data.operation).toBe("update"); // Bypasses create branch cleanly and executes update lane safely
  }, 30000);

  it("Scenario 6: Should process an explicit operation type of update flawlessly", async () => {
    const mockPayload = {
      operation: "update", // Explicit update directive channel pass
      documentType: "product",
      productData: {
        _id: targetTestId,
        title: {
          en: "Automated Vitest Test Workspace Desk (Explicit Update Track)",
        },
        slug: targetTestSlug,
        pricing: { dzd: 62000, eur: 400, usd: 420 },
        stockCount: 310, // Incremented stock count properties
        weightGrams: 42500,
        originCountry: "DZ",
      },
    };
    const response = await dispatchSyncWebhook(mockPayload);
    expect(response.status).toBe(200);

    const data = (await response.json()) as FlatSyncResponseDTO;
    expect(data.success).toBe(true);
    expect(data.operation).toBe("update");
    expect(data.message).toContain("complete");
  }, 30000);

  it("Scenario 7: Should gracefully self-heal database routing vectors if core product rows are half-written", async () => {
    shiftedGhostSlug = `temporary-mismatched-ghost-slug-${Date.now()}`;

    // Simulating an orphan injection by passing the existing variant SKU but an unassigned dummy slug handle
    const mockPayload = {
      operation: "create",
      documentType: "product",
      productData: {
        _id: targetTestId,
        title: { en: "Healed Orphan Configuration Asset" },
        slug: shiftedGhostSlug,
        pricing: { dzd: 1000, eur: 10, usd: 10 },
        stockCount: 10,
      },
    };

    const response = await dispatchSyncWebhook(mockPayload);
    expect(response.status).toBe(200);

    const data = (await response.json()) as FlatSyncResponseDTO;
    expect(data.success).toBe(true);
    expect(data.message).toContain("complete");
    // Verified: The defensive `inspectExistingProductStep` catches the SKU table row index match and routes as an update pass safely!
    expect(data.operation).toBe("update");
  }, 30000);

  it("Scenario 8: Should parse multiple parallel catalog items cleanly down the batch import lane", async () => {
    const mockPayload = {
      operation: "batch",
      documentType: "product",
      batchProducts: [
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

    const response = await dispatchSyncWebhook(mockPayload);
    expect(response.status).toBe(200);
    const data = (await response.json()) as FlatSyncResponseDTO;
    expect(data.success).toBe(true);
    expect(data.operation).toBe("batch");
    expect(data.message).toContain("complete");
  }, 30000);

  it("Scenario 9: Should intercept malformed data data streams, reject processing, and trigger a graceful 500 fallback", async () => {
    const malformedPayload = {
      operation: "create",
      documentType: "product",
      productData: {
        _id: `malformed-token-${uniqueSeedId}`,
        slug: `malformed-slug-${uniqueSeedId}`,
        description: {
          en: "This transaction must drop safely.",
        },
        pricing: { dzd: -45000, eur: -250, usd: 1 },
        stockCount: 10,
        originCountry: "DZ",
        categories: [],
      },
    };

    const response = await dispatchSyncWebhook(malformedPayload);
    expect(response.status).toBe(500);
    const data = (await response.json()) as FlatSyncResponseDTO;
    expect(data.success).toBe(false);
    expect(data.error).toContain("crashed");
  }, 30000);

  it("Scenario 10: Should process multiple overlapping concurrent requests in parallel without thread collisions", async () => {
    const concurrentSeedId = `concur-${uniqueSeedId}`;
    const concurrentPayload = {
      operation: "create",
      documentType: "product",
      productData: {
        _id: concurrentSeedId,
        slug: concurrentSeedId,
        title: { en: "Parallel High-Traffic Workspace Asset" },
        pricing: { dzd: 45000, eur: 300, usd: 320 },
        stockCount: 99,
        categories: [],
      },
    };

    const workerThreads = [
      dispatchSyncWebhook(concurrentPayload),
      dispatchSyncWebhook(concurrentPayload),
      dispatchSyncWebhook(concurrentPayload),
    ];
    const responses = await Promise.all(workerThreads);

    for (const res of responses) {
      expect(res.status).toBe(200);
      const data = (await res.json()) as FlatSyncResponseDTO;
      expect(data.success).toBe(true);
    }
  }, 30000);

  it("Scenario 11: Should trigger cascade deletion removal loops to clear down assets completely", async () => {
    const mockPayload = {
      operation: "delete",
      documentType: "product",
      productData: {
        slug: shiftedGhostSlug || targetTestSlug,
      },
    };

    const response = await dispatchSyncWebhook(mockPayload);
    expect(response.status).toBe(200);

    const data = (await response.json()) as FlatSyncResponseDTO;
    expect(data.success).toBe(true);
    expect(data.operation).toBe("delete");
    expect(data.message).toContain("complete");
  }, 30000);

  it("Scenario 12: Should dynamically handle out-of-stock count sync overrides safely", async () => {
    const outOfStockPayload = {
      operation: "update",
      documentType: "product",
      productData: {
        _id: targetTestId,
        slug: targetTestSlug,
        title: { en: "Automated Vitest Test Workspace Desk (Sold Out State)" },
        pricing: { dzd: 62000, eur: 400, usd: 420 },
        stockCount: 0,
        categories: [],
        manage_inventory: true,
        allow_backorder: false,
      },
    };
    const response = await dispatchSyncWebhook(outOfStockPayload);
    expect(response.status).toBe(200);
    const data = (await response.json()) as FlatSyncResponseDTO;
    expect(data.success).toBe(true);
  }, 30000);

  it("Scenario 13: Should block category cascade deletions if active mapped products remain", async () => {
        const occupationCategoryId = `occupied-cat-${uniqueSeedId}`.toLowerCase().trim();
         const categoryInitPayload = {
      operation: "create",
      documentType: "category",
      productData: {
        _id: occupationCategoryId,
        slug: occupationCategoryId,
        title: { en: "Dynamic Lockdown Collection Layer" }
      }
    };
    const createResponse = await dispatchSyncWebhook(categoryInitPayload);
 expect(createResponse.status).toBe(200);

       const lockPayload = {
      operation: "create",
      documentType: "product",
      productData: {
        _id: `lock-prod-${uniqueSeedId}`,
        slug: `lock-slug-${uniqueSeedId}`,
        title: { en: "Category Lock Token" },
        pricing: { dzd: 1000, eur: 10, usd: 10 },
        stockCount: 1,
        categories: [occupationCategoryId]
      }
    };

    const prodSetupResponse = await dispatchSyncWebhook(lockPayload);
     expect(prodSetupResponse.status).toBe(200);

       const activeCategoryPayload = {
      operation: "delete",
      documentType: "category",
      productData: {
        slug: occupationCategoryId, 
      },
    };

    const response = await dispatchSyncWebhook(activeCategoryPayload);
    expect(response.status).toBe(200);

  

    // Assert that the safety system intercept handles and protects relational consistency
    const data = (await response.json()) as FlatSyncResponseDTO;
     expect(data.success).toBe(false); 
  }, 30000);
});
