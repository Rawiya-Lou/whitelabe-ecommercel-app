import http from "http";

const SECRET_TOKEN = process.env.SANITY_SYNC_SECRET_TOKEN || "development";
const seed = Date.now();
const categoryId = `test-category-${seed}`;

const mockCategoryPayload = {
  _type: "category",
  _id: categoryId,
  title: { en: "Local webhook test category" },
  slug: { current: `local-webhook-test-category-${seed}` },
};

const mockProductPayload = {
  operation: "create",
  _type: "product",
  _id: `test-product-${seed}`,
  title: { en: "Local webhook test product" },
  slug: { current: `local-webhook-test-product-${seed}` },
  pricing: {
    dzd: 49500,
    eur: 320,
    usd: 340,
  },
  stockCount: 140,
  weightGrams: 36500,
  originCountry: "DZ",
  categories: [{ _type: "reference", _ref: categoryId }],
  images: [],
  manage_inventory: true,
  allow_backorder: false,
};

function postWebhook(payload: object): Promise<{ statusCode: number; body: string }> {
  const payloadString = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "localhost",
        port: 9000,
        path: "/sanity-sync",
        method: "POST",
        headers: {
          "x-sanity-sync-token": SECRET_TOKEN,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payloadString),
        },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({ statusCode: response.statusCode ?? 500, body });
        });
      },
    );

    request.on("error", reject);
    request.write(payloadString);
    request.end();
  });
}

async function main(): Promise<void> {
  for (const payload of [mockCategoryPayload, mockProductPayload]) {
    const result = await postWebhook(payload);
    console.log(`Webhook status: ${result.statusCode}`);

    try {
      console.log("Response:", JSON.parse(result.body));
    } catch {
      console.log("Response:", result.body);
    }

    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(`Webhook request failed with status ${result.statusCode}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(
    `Webhook simulation failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
