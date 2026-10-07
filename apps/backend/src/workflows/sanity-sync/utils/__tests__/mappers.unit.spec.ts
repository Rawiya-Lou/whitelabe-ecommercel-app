import { describe, expect, it } from "vitest";
import { mapSanityToMedusaProduct } from "../mappers";
import type { SanityProductPayload } from "../../types";

describe("mapSanityToMedusaProduct", () => {
  it("maps Sanity prices to Medusa minor units and preserves category associations", () => {
    const product: SanityProductPayload = {
      _id: "sanity-product-1",
      title: { en: "Desk" },
      description: { en: "" },
      slug: "desk",
      metadata: { sanity_id: "sanity-product-1", title_en: "Desk", is_sync_origin: "sanity"  },
      basePriceDzd: 1234.5,
      basePriceEur: 20,
      basePriceUsd: 25.75,
      stockCount: 2,
      categories: [],
      images: [{ url: "https://cdn.sanity.io/image.png" }],
    };

    const mapped = mapSanityToMedusaProduct(product, ["pcat_existing"]);
    const variant = mapped.variants?.[0];

    expect(variant?.prices).toEqual([
      { currency_code: "dzd", amount: 123450 },
      { currency_code: "eur", amount: 2000 },
      { currency_code: "usd", amount: 2575 },
    ]);
    expect(mapped.categories).toEqual([{ id: "pcat_existing" }]);
    expect(mapped.metadata).toEqual({
      sanity_id: "sanity-product-1",
      title_en: "Desk",
    });
  });
});
