import { describe, expect, it, vi } from "vitest";
import { resolveProductTagIds } from "../resolve-product-tags";

describe("resolveProductTagIds", () => {
  it("reuses existing tags and creates only missing values", async () => {
    const productService = {
      listProductTags: vi.fn().mockResolvedValue([
        { id: "ptag_existing", value: "shirt" },
      ]),
      createProductTags: vi
        .fn()
        .mockResolvedValue([{ id: "ptag_new", value: "linen" }]),
    };

    await expect(
      resolveProductTagIds(
        productService as never,
        [" shirt ", "linen", "shirt", ""],
      ),
    ).resolves.toEqual(["ptag_existing", "ptag_new"]);

    expect(productService.createProductTags).toHaveBeenCalledWith([
      { value: "linen" },
    ]);
  });

  it("recovers when a concurrent sync creates a tag after lookup", async () => {
    const productService = {
      listProductTags: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "ptag_raced", value: "shirt" }]),
      createProductTags: vi
        .fn()
        .mockRejectedValue(new Error("Product tag with value: shirt, already exists.")),
    };

    await expect(
      resolveProductTagIds(productService as never, ["shirt"]),
    ).resolves.toEqual(["ptag_raced"]);
  });

  it("rethrows creation failures when the missing tag was not created elsewhere", async () => {
    const createError = new Error("Database unavailable");
    const productService = {
      listProductTags: vi.fn().mockResolvedValue([]),
      createProductTags: vi.fn().mockRejectedValue(createError),
    };

    await expect(
      resolveProductTagIds(productService as never, ["shirt"]),
    ).rejects.toBe(createError);
  });
});
