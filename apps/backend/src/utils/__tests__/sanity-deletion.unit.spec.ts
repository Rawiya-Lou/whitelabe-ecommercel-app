import { afterEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "@medusajs/framework/types";
import { assertCategoryCanBeDeleted } from "../product-category-delete-guard";
import { deleteSanityDocument } from "../sanity-document-delete";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

const savedEnvironment = {
  token: process.env.SANITY_API_TOKEN,
  projectId: process.env.SANITY_PROJECT_ID,
  studioProjectId: process.env.SANITY_STUDIO_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  studioDataset: process.env.SANITY_STUDIO_DATASET,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.env.SANITY_API_TOKEN = savedEnvironment.token;
  process.env.SANITY_PROJECT_ID = savedEnvironment.projectId;
  process.env.SANITY_STUDIO_PROJECT_ID = savedEnvironment.studioProjectId;
  process.env.SANITY_DATASET = savedEnvironment.dataset;
  process.env.SANITY_STUDIO_DATASET = savedEnvironment.studioDataset;
});

describe("category deletion guard", () => {
  it("allows deleting an empty category", () => {
    expect(() =>
      assertCategoryCanBeDeleted({
        id: "pcat_empty",
        name: "Empty",
        products: [],
      }),
    ).not.toThrow();
  });

  it("blocks deleting a category that has products", () => {
    expect(() =>
      assertCategoryCanBeDeleted({
        id: "pcat_used",
        name: "Used",
        products: [{ id: "prod_1" }],
      }),
    ).toThrow(/contains 1 product/);
  });
});

describe("Sanity deletion mutation", () => {
  it("deletes both the published and draft document IDs", async () => {
    process.env.SANITY_API_TOKEN = "test-write-token";
    process.env.SANITY_PROJECT_ID = "test-project";
    process.env.SANITY_DATASET = "development";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteSanityDocument({
      documentId: "drafts.sanity-doc-1",
      logger,
      context: "unit test",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0];
    expect(request[0]).toBe(
      "https://test-project.api.sanity.io/v2021-06-07/data/mutate/development",
    );
    expect(JSON.parse(String(request[1]?.body))).toEqual({
      mutations: [
        { delete: { id: "sanity-doc-1" } },
        { delete: { id: "drafts.sanity-doc-1" } },
      ],
    });
  });

  it("does not issue a request without a Sanity write token", async () => {
    delete process.env.SANITY_API_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await deleteSanityDocument({
      documentId: "sanity-doc-2",
      logger,
      context: "unit test",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
