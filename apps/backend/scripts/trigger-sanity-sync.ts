import http from "http";

const SECRET_TOKEN = "development-test-override-token";
const PUBLISH_TOKEN =
  "pk_ea79ea0e54d16e2c6faf4b4bfb9049d3ad3b9a10fd7cc866d566f518f972999a";

const mockWebhookPayload = {
  operation: "create",
  documentType: "product",
  productData: {
    _id: "test-prod-compiled-999",
    meudsaId: "prod_01J7K8M9N1P2Q3R4S5T6V7W8X9",
    title: {
      en: "Compiled Heavy Duty Work Desk (Enterprise Edition v3)",
      fr: "Bureau lourd compilé Pro",
      ar: "مكتب عمل ميكانيكية مطور",
    },
    slug: "compiled-heavy-duty-work-desk",
    pricing: {
      dzd: 49500,
      eur: 320,
      usd: 340,
    },
    stockCount: 140,
    weightGrams: 36500,
    lengthMm: 1200,
    widthMm: 800,
    heightMm: 750,
    originCountry: "DZ",
    categories: [
       {
        _id: "cat-office-furniture-001",
        title: {
          en: "Office Furniture",
          ar: "أثاث المكاتب"
        },
        slug: "office-furniture"
      },
       {
        _id: "cat-workspace-heavy-002",
        title: {
          en: "Heavy Duty Equipment"
        },
        slug: "heavy-duty-equipment"
      }
    ],
    images: [
      {
        _key: "asset-key-primary-studio-desk",
        url: "https://unsplash.com"
      },
       {
        _key: "asset-key-angle-two-studio-desk",
        url: "https://unsplash.com"
      }
    ],
    manage_inventory: true,
    allow_backorder: false,
  },
};

const payloadString = JSON.stringify(mockWebhookPayload);

const options = {
  hostname: "localhost",
  port: 9000,
  path: "/store/sanity-sync",
  method: "POST",
  headers: {
    "x-sanity-sync-token": SECRET_TOKEN,
    "x-publishable-api-key": PUBLISH_TOKEN,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payloadString),
  },
};

console.log(
  "Dispatching Local Webhook Simulation Pass directly into Medusa Engine...",
);

const req = http.request(options, (res) => {
  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });
  res.on("end", () => {
    console.log(
      `\n Transaction complete! Server Status Code: [${res.statusCode}]`,
    );
    console.log(" Response Matrix:", JSON.parse(data));
  });
});

req.on("error", (e) => {
  console.error(` Request execution collapsed: ${e.message}`);
});

req.write(payloadString);
req.end();
