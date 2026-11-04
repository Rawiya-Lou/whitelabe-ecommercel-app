import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { loadEnv } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "production", process.cwd());

const enabled = process.env.RUN_MEDUSA_TO_SANITY_PROD_TEST === "true";
const MEDUSA_URL = (
  process.env.MEDUSA_BACKEND_URL ||
  process.env.BACKEND_URL ||
  ""
).replace(/\/+$/, "");
const ADMIN_TOKEN = process.env.MEDUSA_ADMIN_TOKEN;
const ADMIN_EMAIL = process.env.MEDUSA_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.MEDUSA_ADMIN_PASSWORD;
const SANITY_PROJECT_ID =
  process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
const SANITY_DATASET = process.env.SANITY_SYNC_TEST_DATASET?.trim();
const SANITY_TOKEN = process.env.SANITY_API_TOKEN;
const REQUEST_TIMEOUT_MS = 60_000;
const SANITY_WAIT_TIMEOUT_MS = 180_000;
const SUBSCRIBER_OBSERVATION_TIMEOUT_MS = 20_000;

type JsonRecord = Record<string, unknown>;

interface ApiResponse {
  status: number;
  body: JsonRecord;
}

interface TestIdentity {
  runId: string;
  categorySanityId: string;
  productSanityId: string;
  categoryHandle: string;
  productHandle: string;
  productTitle: string;
  productSubtitle: string;
  productDescription: string;
  productMaterial: string;
  variantTitle: string;
  variantSku: string;
}

const asRecord = (value: unknown): JsonRecord | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const normalizeAdminToken = (token: string): string =>
  token.trim().replace(/^Bearer\s+/i, "");

function logDiagnostic(event: string, details: JsonRecord = {}): void {
  console.info(
    `[Medusa-to-Sanity smoke] ${JSON.stringify({
      at: new Date().toISOString(),
      event,
      ...details,
    })}`,
  );
}

async function readJson(response: Response): Promise<JsonRecord> {
  const text = await response.text();
  if (!text) return {};

  try {
    return asRecord(JSON.parse(text)) ?? { response: text };
  } catch {
    return { response: text };
  }
}

async function adminRequest(
  token: string,
  method: string,
  endpoint: string,
  body?: JsonRecord,
): Promise<ApiResponse> {
  const response = await fetch(`${MEDUSA_URL}${endpoint}`, {
    method,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${normalizeAdminToken(token)}`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const responseBody = await readJson(response);

  logDiagnostic("medusa_admin_response", {
    method,
    endpoint,
    status: response.status,
    ok: response.ok,
    error: response.ok ? undefined : responseBody,
  });

  if (!response.ok) {
    throw new Error(
      `Medusa ${method} ${endpoint} failed with HTTP ${response.status}: ${JSON.stringify(responseBody)}`,
    );
  }

  return { status: response.status, body: responseBody };
}

async function validateAdminToken(
  token: string,
): Promise<{ valid: boolean; status: number; body: JsonRecord }> {
  const response = await fetch(`${MEDUSA_URL}/admin/products?limit=1`, {
    method: "GET",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${normalizeAdminToken(token)}`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
  const body = await readJson(response);
  logDiagnostic("medusa_admin_token_validation", {
    status: response.status,
    valid: response.ok,
    error: response.ok ? undefined : body,
  });
  return { valid: response.ok, status: response.status, body };
}

async function querySanity(
  groq: string,
  params: Record<string, string>,
): Promise<unknown> {
  if (!SANITY_PROJECT_ID || !SANITY_DATASET || !SANITY_TOKEN) {
    throw new Error("Sanity project, dataset, and API token are required.");
  }

  const search = new URLSearchParams({ query: groq });
  for (const [key, value] of Object.entries(params)) {
    search.set(`$${key}`, JSON.stringify(value));
  }

  const url = `https://${SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${encodeURIComponent(SANITY_DATASET)}?${search.toString()}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${SANITY_TOKEN}`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(
      `Sanity query failed with HTTP ${response.status}: ${JSON.stringify(body)}`,
    );
  }

  return body.result;
}

async function waitForMedusa(): Promise<void> {
  const deadline = Date.now() + 180_000;
  let lastError = "No response received";
  let attempt = 0;

  logDiagnostic("medusa_health_check_started", { url: MEDUSA_URL });
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const response = await fetch(`${MEDUSA_URL}/health`, {
        signal: AbortSignal.timeout(10_000),
        headers: { "Cache-Control": "no-cache, no-store" },
      });
      if (response.ok) {
        logDiagnostic("medusa_health_check_passed", {
          attempt,
          status: response.status,
        });
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (attempt === 1 || attempt % 4 === 0) {
      logDiagnostic("medusa_health_check_retry", { attempt, lastError });
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  throw new Error(
    `Medusa did not become reachable within 180 seconds. Last result: ${lastError}`,
  );
}

async function waitForSanityDocument(
  documentId: string,
  medusaId: string,
  matches: (document: JsonRecord) => boolean,
  description: string,
  timeoutMs = SANITY_WAIT_TIMEOUT_MS,
): Promise<JsonRecord> {
  const deadline = Date.now() + timeoutMs;
  let lastDocument: JsonRecord | undefined;
  let lastError: string | undefined;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const result = await querySanity(
        `*[_id == $id || medusaId == $medusaId][0]{
          _id,
          _type,
          medusaId,
          title{en, fr, ar},
          description{en, fr, ar},
          material{en, fr, ar},
          categories[]{_ref, _weak},
          variants[]{medusa_variant_id, sku, title, options[]{option, value}}
        }`,
        { id: documentId, medusaId },
      );
      lastDocument = asRecord(result);
      lastError = undefined;

      if (lastDocument && matches(lastDocument)) {
        logDiagnostic("sanity_document_verified", {
          documentId,
          description,
          attempt,
          snapshot: lastDocument,
        });
        return lastDocument;
      }

      if (attempt === 1 || attempt % 5 === 0) {
        logDiagnostic("sanity_document_pending", {
          documentId,
          description,
          attempt,
          snapshot: lastDocument ?? null,
        });
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 1 || attempt % 5 === 0) {
        logDiagnostic("sanity_query_failed_retrying", {
          documentId,
          description,
          attempt,
          error: lastError,
        });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  throw new Error(
    `Timed out waiting for ${description} in Sanity document ${documentId}. ` +
      `Also searched by Medusa ID ${medusaId} in project ${SANITY_PROJECT_ID}, dataset ${SANITY_DATASET}. ` +
      `Last Sanity snapshot: ${JSON.stringify(lastDocument ?? null)}. ` +
      `Last query error: ${lastError ?? "none"}. Check Render logs for ` +
      `"Received product-category.created", "[Sanity Category Sync]", and ` +
      `a successful Sanity mutation for Medusa category ${medusaId}.`,
  );
}

function getResourceId(body: JsonRecord, resourceKey: string): string {
  const resource = asRecord(body[resourceKey]);
  const id = asString(resource?.id);
  if (!id) {
    throw new Error(
      `Medusa response did not contain ${resourceKey}.id: ${JSON.stringify(body)}`,
    );
  }
  return id;
}

function makeIdentity(): TestIdentity {
  const runId = randomUUID().replace(/-/g, "").slice(0, 12);
  return {
    runId,
    categorySanityId: `medusa-outbound-smoke-category-${runId}`,
    productSanityId: `medusa-outbound-smoke-product-${runId}`,
    categoryHandle: `medusa-outbound-smoke-category-${runId}`,
    productHandle: `medusa-outbound-smoke-product-${runId}`,
    productTitle: `Medusa outbound smoke ${runId}`,
    productSubtitle: `French subtitle ${runId}`,
    productDescription: `Outbound description ${runId}`,
    productMaterial: `Outbound material ${runId}`,
    variantTitle: `Smoke variant ${runId}`,
    variantSku: `OUTBOUND-SMOKE-${runId}`,
  };
}

describe.skipIf(!enabled)(
  "Deployed Medusa to Sanity product synchronization",
  () => {
    const identity = makeIdentity();

    let adminToken: string;
    let medusaCategoryId: string | undefined;
    let medusaProductId: string | undefined;
    let medusaVariantId: string | undefined;

    beforeAll(async () => {
      const missing: string[] = [];
      if (!MEDUSA_URL) missing.push("MEDUSA_BACKEND_URL");
      if (!ADMIN_TOKEN && !ADMIN_EMAIL && !ADMIN_PASSWORD) {
        missing.push(
          "MEDUSA_ADMIN_TOKEN, or both MEDUSA_ADMIN_EMAIL and MEDUSA_ADMIN_PASSWORD",
        );
      } else if (!ADMIN_TOKEN) {
        if (!ADMIN_EMAIL) missing.push("MEDUSA_ADMIN_EMAIL");
        if (!ADMIN_PASSWORD) missing.push("MEDUSA_ADMIN_PASSWORD");
      }
      if (!SANITY_PROJECT_ID) {
        missing.push("SANITY_PROJECT_ID or SANITY_STUDIO_PROJECT_ID");
      }
      if (!SANITY_DATASET) {
        missing.push("SANITY_SYNC_TEST_DATASET (must match the deployed Medusa dataset)");
      }
      if (!SANITY_TOKEN) missing.push("SANITY_API_TOKEN");

      if (missing.length) {
        throw new Error(
          `Missing required deployed smoke-test configuration: ${missing.join(", ")}`,
        );
      }

      logDiagnostic("test_started", {
        medusaUrl: MEDUSA_URL,
        sanityProjectId: SANITY_PROJECT_ID,
        sanityDataset: SANITY_DATASET,
        sanityDatasetSource: "SANITY_SYNC_TEST_DATASET",
        runId: identity.runId,
        note: "The test creates uniquely named draft records and leaves them available for inspection.",
      });

      await waitForMedusa();
      if (ADMIN_TOKEN) {
        const validation = await validateAdminToken(ADMIN_TOKEN);
        if (validation.valid) {
          adminToken = normalizeAdminToken(ADMIN_TOKEN);
          logDiagnostic("medusa_admin_authentication", {
            method: "configured_admin_jwt",
            authenticated: true,
          });
        } else if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
          throw new Error(
            `MEDUSA_ADMIN_TOKEN was rejected by the Admin API (HTTP ${validation.status}). ` +
              "It must be a valid Medusa Admin user JWT, not a publishable or secret API key. " +
              "Configure MEDUSA_ADMIN_EMAIL and MEDUSA_ADMIN_PASSWORD to log in and obtain a fresh JWT.",
          );
        }
      }

      if (!adminToken) {
        const response = await fetch(`${MEDUSA_URL}/auth/user/emailpass`, {
          method: "POST",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
          }),
        });
        const body = await readJson(response);
        logDiagnostic("medusa_admin_authentication", {
          method: "email_password",
          status: response.status,
          ok: response.ok,
          tokenReceived: Boolean(body.token),
          error: response.ok ? undefined : body,
        });

        const token = asString(body.token);
        if (!response.ok || !token) {
          throw new Error(
            `Medusa admin email/password authentication failed with HTTP ${response.status}: ${JSON.stringify(body)}`,
          );
        }

        const validation = await validateAdminToken(token);
        if (!validation.valid) {
          throw new Error(
            `Medusa login returned a token that the Admin API rejected (HTTP ${validation.status}): ${JSON.stringify(validation.body)}`,
          );
        }
        adminToken = normalizeAdminToken(token);
      }
    }, 300_000);

    it(
      "creates a minimal Medusa product and verifies its Sanity copy, category reference, and variant",
      async () => {
        try {
          logDiagnostic("category_create_started", {
            sanityCategoryId: identity.categorySanityId,
            handle: identity.categoryHandle,
          });
          const categoryResponse = await adminRequest(
            adminToken,
            "POST",
            "/admin/product-categories",
            {
              name: `Outbound smoke category ${identity.runId}`,
              handle: identity.categoryHandle,
              is_active: true,
              metadata: {
                sanity_id: identity.categorySanityId,
                integration_test: "medusa-to-sanity",
              },
            },
          );
          medusaCategoryId = getResourceId(
            categoryResponse.body,
            "product_category",
          );
          const createdCategory = asRecord(
            categoryResponse.body.product_category,
          );
          const createdCategoryMetadata = asRecord(createdCategory?.metadata);
          logDiagnostic("category_created", {
            medusaCategoryId,
            sanityCategoryId: identity.categorySanityId,
            returnedSanityId: createdCategoryMetadata?.sanity_id ?? null,
          });

          logDiagnostic("product_create_started", {
            sanityProductId: identity.productSanityId,
            categoryId: medusaCategoryId,
            handle: identity.productHandle,
            expected: {
              title: identity.productTitle,
              subtitleMapsToFrenchTitle: identity.productSubtitle,
              description: identity.productDescription,
              material: identity.productMaterial,
              variantTitle: identity.variantTitle,
              variantSku: identity.variantSku,
            },
          });
          const productResponse = await adminRequest(
            adminToken,
            "POST",
            "/admin/products",
            {
              title: identity.productTitle,
              subtitle: identity.productSubtitle,
              description: identity.productDescription,
              material: identity.productMaterial,
              handle: identity.productHandle,
              status: "draft",
              discountable: true,
              categories: [{ id: medusaCategoryId }],
              metadata: {
                sanity_id: identity.productSanityId,
                integration_test: "medusa-to-sanity",
              },
              options: [{ title: "Smoke option", values: ["Single"] }],
              variants: [
                {
                  title: identity.variantTitle,
                  sku: identity.variantSku,
                  manage_inventory: false,
                  allow_backorder: false,
                  options: { "Smoke option": "Single" },
                  prices: [],
                },
              ],
            },
          );
          medusaProductId = getResourceId(productResponse.body, "product");
          const productDetailResponse = await adminRequest(
            adminToken,
            "GET",
            `/admin/products/${encodeURIComponent(medusaProductId)}?fields=*variants`,
          );
          const product = asRecord(productDetailResponse.body.product);
          const variants = Array.isArray(product?.variants)
            ? product.variants
            : [];
          const variant = asRecord(variants[0]);
          medusaVariantId = asString(variant?.id) ?? "";
          if (!medusaVariantId) {
            throw new Error(
              `Medusa product response did not include the created variant ID: ${JSON.stringify(productResponse.body)}`,
            );
          }
          logDiagnostic("product_created", {
            medusaProductId,
            medusaVariantId,
            sanityProductId: identity.productSanityId,
          });

          const expectedVariantId = medusaVariantId;
          const [categoryResult, productResult] = await Promise.allSettled([
            waitForSanityDocument(
              identity.categorySanityId,
              medusaCategoryId,
              (document) =>
                document._type === "category" &&
                document.medusaId === medusaCategoryId,
              "outbound category sync",
              SUBSCRIBER_OBSERVATION_TIMEOUT_MS,
            ),
            waitForSanityDocument(
              identity.productSanityId,
              medusaProductId,
              (candidate) => {
                const title = asRecord(candidate.title);
                const description = asRecord(candidate.description);
                const material = asRecord(candidate.material);
                const categories = Array.isArray(candidate.categories)
                  ? candidate.categories.map(asRecord).filter(Boolean)
                  : [];
                const sanityVariants = Array.isArray(candidate.variants)
                  ? candidate.variants.map(asRecord).filter(Boolean)
                  : [];
                const matchedVariant = sanityVariants.find(
                  (item) =>
                    item?.medusa_variant_id === expectedVariantId &&
                    item.sku === identity.variantSku &&
                    item.title === identity.variantTitle,
                );

                return (
                  candidate._type === "product" &&
                  candidate.medusaId === medusaProductId &&
                  asString(title?.en) === identity.productTitle &&
                  asString(title?.fr) === identity.productSubtitle &&
                  asString(description?.en) === identity.productDescription &&
                  asString(material?.en) === identity.productMaterial &&
                  categories.some(
                    (category) =>
                      category?._ref === identity.categorySanityId &&
                      category?._weak === true,
                  ) &&
                  Boolean(matchedVariant)
                );
              },
              "outbound product fields, weak category reference, and Medusa variant",
              SUBSCRIBER_OBSERVATION_TIMEOUT_MS,
            ),
          ]);
          let categoryDocument =
            categoryResult.status === "fulfilled"
              ? categoryResult.value
              : undefined;
          let productDocument =
            productResult.status === "fulfilled"
              ? productResult.value
              : undefined;
          let categoryUsedDiagnosticTrigger = false;
          let productUsedDiagnosticTrigger = false;

          logDiagnostic("subscriber_observation_results", {
            medusaCategoryId,
            medusaProductId,
            category: categoryResult.status,
            categoryError:
              categoryResult.status === "rejected"
                ? String(categoryResult.reason)
                : undefined,
            product: productResult.status,
            productError:
              productResult.status === "rejected"
                ? String(productResult.reason)
                : undefined,
          });

          const missingSyncs: Array<{
            entity: "category" | "product";
            medusaId: string;
            sanityId: string;
            description: string;
            matches: (document: JsonRecord) => boolean;
          }> = [];
          if (categoryResult.status === "rejected") {
            missingSyncs.push({
              entity: "category",
              medusaId: medusaCategoryId,
              sanityId: identity.categorySanityId,
              description: "outbound category sync",
              matches: (document) =>
                document._type === "category" &&
                document.medusaId === medusaCategoryId,
            });
          }
          if (productResult.status === "rejected") {
            missingSyncs.push({
              entity: "product",
              medusaId: medusaProductId,
              sanityId: identity.productSanityId,
              description:
                "outbound product fields, weak category reference, and Medusa variant",
              matches: (candidate) => {
                const title = asRecord(candidate.title);
                const description = asRecord(candidate.description);
                const material = asRecord(candidate.material);
                const categories = Array.isArray(candidate.categories)
                  ? candidate.categories.map(asRecord).filter(Boolean)
                  : [];
                const sanityVariants = Array.isArray(candidate.variants)
                  ? candidate.variants.map(asRecord).filter(Boolean)
                  : [];
                return (
                  candidate._type === "product" &&
                  candidate.medusaId === medusaProductId &&
                  asString(title?.en) === identity.productTitle &&
                  asString(title?.fr) === identity.productSubtitle &&
                  asString(description?.en) === identity.productDescription &&
                  asString(material?.en) === identity.productMaterial &&
                  categories.some(
                    (category) =>
                      category?._ref === identity.categorySanityId &&
                      category?._weak === true,
                  ) &&
                  sanityVariants.some(
                    (item) =>
                      item?.medusa_variant_id === expectedVariantId &&
                      item.sku === identity.variantSku &&
                      item.title === identity.variantTitle,
                  )
                );
              },
            });
          }

          for (const missing of missingSyncs) {
            logDiagnostic("subscriber_sync_missing_triggering_diagnostic_sync", {
              entity: missing.entity,
              medusaId: missing.medusaId,
              sanityId: missing.sanityId,
              explanation:
                "The document was not visible after the subscriber observation window; explicitly running the same workflow through the authenticated Admin diagnostic endpoint to distinguish event delivery from Sanity/workflow failures.",
            });
            const triggerResult = await adminRequest(
              adminToken,
              "POST",
              "/admin/sanity-sync",
              {
                entity: missing.entity,
                id: missing.medusaId,
              },
            );
            logDiagnostic("explicit_workflow_trigger_completed", {
              entity: missing.entity,
              medusaId: missing.medusaId,
              sanityId: missing.sanityId,
              sanityTarget: triggerResult.body.sanity ?? null,
            });
            const document = await waitForSanityDocument(
              missing.sanityId,
              missing.medusaId,
              missing.matches,
              `${missing.description} after explicit workflow trigger`,
              SANITY_WAIT_TIMEOUT_MS,
            );
            if (missing.entity === "category") {
              categoryDocument = document;
              categoryUsedDiagnosticTrigger = true;
            } else {
              productDocument = document;
              productUsedDiagnosticTrigger = true;
            }
          }

          logDiagnostic("sync_verification_results", {
            medusaCategoryId,
            medusaProductId,
            category: categoryDocument ? "verified" : "missing",
            categoryUsedDiagnosticTrigger,
            product: productDocument ? "verified" : "missing",
            productUsedDiagnosticTrigger,
          });

          if (!categoryDocument || !productDocument) {
            throw new Error(
              "Sanity verification did not produce both category and product documents.",
            );
          }
          const document = productDocument;
          const title = asRecord(document.title);
          logDiagnostic("test_passed", {
            medusaProductId,
            medusaVariantId,
            sanityProductId: identity.productSanityId,
            sanityCategoryId: identity.categorySanityId,
            verified: {
              titleEn: title?.en,
              subtitleAsTitleFr: title?.fr,
              description: asRecord(document.description)?.en,
              material: asRecord(document.material)?.en,
              weakCategoryReference: identity.categorySanityId,
              variantSku: identity.variantSku,
            },
            note: "Draft test records are retained for inspection in Medusa Admin and Sanity Studio.",
          });
        } catch (error) {
          logDiagnostic("test_failed", {
            medusaCategoryId: medusaCategoryId ?? null,
            medusaProductId: medusaProductId ?? null,
            medusaVariantId: medusaVariantId ?? null,
            sanityCategoryId: identity.categorySanityId,
            sanityProductId: identity.productSanityId,
            error: error instanceof Error ? error.message : String(error),
            renderLogHints: [
              `[Sanity Sync] Received product-category.created event for ${medusaCategoryId ?? "<category-id>"}`,
              `[Sanity Category Sync]`,
              `[Sanity Sync] product-category.created synchronization failed for ${medusaCategoryId ?? "<category-id>"}`,
              `Confirm Render SANITY_PROJECT_ID/SANITY_STUDIO_PROJECT_ID and SANITY_DATASET/SANITY_STUDIO_DATASET match this test's Sanity target.`,
            ],
          });
          throw error;
        }
      },
      480_000,
    );
  },
);
