import { afterEach, describe, expect, it, vi } from "vitest";
import SanityModuleService from "../service";
import { syncLock } from "../../../utils/sync-lock";

describe("SanityModuleService", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("preserves Sanity editorial fields and prunes removed variants", async () => {
    vi.spyOn(syncLock, "acquire").mockResolvedValue("lease-token");
    const release = vi.spyOn(syncLock, "release").mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: {
              _id: "product-1",
              variants: [
                {
                  _type: "object",
                  _key: "variant-1",
                  medusa_variant_id: "variant-1",
                  sku: "OLD-SKU",
                  title: "Old title",
                  options: [{ option: "Color", value: "Black" }],
                  images: [{ _key: "gallery-image", asset: { _ref: "image-1" } }],
                  swatchImage: { asset: { _ref: "swatch-1" } },
                  details: { en: "Editorial details" },
                  customStudioField: "preserve me",
                },
                {
                  _key: "removed-variant",
                  medusa_variant_id: "removed-variant",
                  sku: "REMOVED",
                },
              ],
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ transactionId: "transaction-1" }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const service = new SanityModuleService(
      {},
      {
        api_token: "test-token",
        project_id: "test-project",
        dataset: "production",
      },
    );

    await expect(
      service.syncProductVariants("product-1", [
        {
          id: "variant-1",
          sku: "NEW-SKU",
          title: "Blue Jeans - Size Large",
          options: [
            { option: { title: "Color" }, value: "Black" },
            { option: { title: "Size" }, value: "Large" },
          ],
        },
      ]),
    ).resolves.toEqual({
      changed: true,
      reason: "updated",
      variantCount: 1,
    });

    const mutation = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    const variant = mutation.mutations[0].patch.set.variants[0];
    expect(mutation.mutations[0].patch.set.variants).toHaveLength(1);
    expect(variant).toEqual(
      expect.objectContaining({
        _key: "variant-1",
        medusa_variant_id: "variant-1",
        sku: "NEW-SKU",
        title: "Blue Jeans - Size Large",
        images: [{ _key: "gallery-image", asset: { _ref: "image-1" } }],
        swatchImage: { asset: { _ref: "swatch-1" } },
        details: { en: "Editorial details" },
        customStudioField: "preserve me",
      }),
    );
    expect(variant.options).toEqual([
      expect.objectContaining({
        _type: "object",
        option: "Color",
        value: "Black",
        _key: expect.any(String),
      }),
      expect.objectContaining({
        _type: "object",
        option: "Size",
        value: "Large",
        _key: expect.any(String),
      }),
    ]);
    for (const option of [...variant.options, ...variant.optionValues]) {
      expect(option._key).toEqual(expect.any(String));
    }
    expect(mutation.mutations[0].patch.set.updatedBy).toBe("medusa");
    expect(release).toHaveBeenCalledWith(
      "medusa-sync:product-1",
      "lease-token",
    );
  });

  it("skips the mutation when variant structure is unchanged", async () => {
    vi.spyOn(syncLock, "acquire").mockResolvedValue("lease-token");
    vi.spyOn(syncLock, "release").mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          result: {
            variants: [
              {
                _key: "variant-1",
                medusa_variant_id: "variant-1",
                sku: "SKU-1",
                title: "Black / Large",
                options: [
                  {
                    _type: "object",
                    _key: "color-option",
                    option: "Color",
                    value: "Black",
                  },
                  {
                    _type: "object",
                    _key: "size-option",
                    option: "Size",
                    value: "Large",
                  },
                ],
                optionValues: [
                  {
                    _type: "object",
                    _key: "color-option-value",
                    option: "Color",
                    value: "Black",
                  },
                  {
                    _type: "object",
                    _key: "size-option-value",
                    option: "Size",
                    value: "Large",
                  },
                ],
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = new SanityModuleService(
      {},
      {
        api_token: "test-token",
        project_id: "test-project",
        dataset: "production",
      },
    );

    await expect(
      service.syncProductVariants("product-1", [
        {
          id: "variant-1",
          sku: "SKU-1",
          options: [
            { option: { title: "Color" }, value: "Black" },
            { option: { title: "Size" }, value: "Large" },
          ],
        },
      ]),
    ).resolves.toEqual({
      changed: false,
      reason: "unchanged",
      variantCount: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves editorial variant media when the Medusa ID changed but the SKU matches", async () => {
    vi.spyOn(syncLock, "acquire").mockResolvedValue("lease-token");
    vi.spyOn(syncLock, "release").mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: {
              _id: "product-1",
              variants: [
                {
                  _type: "object",
                  _key: "sanity-row-key",
                  sanity_variant_id: "sanity-row-key",
                  sku: "JEANS-BLUE-32",
                  title: "Blue / 32",
                  options: [
                    {
                      _key: "color-option",
                      option: "Color",
                      value: "Blue",
                    },
                  ],
                  images: [
                    {
                      _key: "blue-jeans-gallery",
                      asset: { _ref: "image-blue-jeans" },
                    },
                  ],
                  details: { en: "Keep this editorial copy" },
                },
              ],
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ transactionId: "transaction-2" }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const service = new SanityModuleService(
      {},
      {
        api_token: "test-token",
        project_id: "test-project",
        dataset: "production",
      },
    );

    await service.syncProductVariants("product-1", [
      {
        id: "variant_medusa_new_id",
        sku: "JEANS-BLUE-32",
        options: [
          { option: { title: "Color" }, value: "Blue" },
          { option: { title: "Size" }, value: "32" },
        ],
      },
    ]);

    const mutation = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    const [variant] = mutation.mutations[0].patch.set.variants;
    expect(variant).toEqual(
      expect.objectContaining({
        _key: "variant_medusa_new_id",
        medusa_variant_id: "variant_medusa_new_id",
        sku: "JEANS-BLUE-32",
        images: [
          {
            _key: "blue-jeans-gallery",
            asset: { _ref: "image-blue-jeans" },
          },
        ],
        details: { en: "Keep this editorial copy" },
      }),
    );
    expect(mutation.mutations[0].patch.set.variants).toHaveLength(1);
  });

  it("retries when the connection closes while reading the response body", async () => {
    vi.useFakeTimers();
    const closedResponse = {
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      text: vi.fn().mockRejectedValue(new Error("Connection closed")),
    } as unknown as Response;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(closedResponse)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: [{ _id: "product-1" }] }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const service = new SanityModuleService(
      {},
      {
        api_token: "test-token",
        project_id: "test-project",
        dataset: "production",
      },
    );

    const resultPromise = service.query('*[_type == "product"]');
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual([{ _id: "product-1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries transient Sanity responses before parsing the final body", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("temporarily unavailable", { status: 503 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ transactionId: "transaction-1" }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const service = new SanityModuleService(
      {},
      {
        api_token: "test-token",
        project_id: "test-project",
        dataset: "production",
      },
    );

    const resultPromise = service.mutate([
      { patch: { id: "product-1", set: { updatedBy: "medusa" } } },
    ]);
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({
      transactionId: "transaction-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
