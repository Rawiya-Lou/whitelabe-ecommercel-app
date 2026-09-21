// apps/backend/scripts/trigger-sanity-sync.ts
import http from "http";

const SECRET_TOKEN = "development-override-token";
const PUBLISH_TOKEN = process.env.PUBLISH_KEY || "pk_ea79ea0e54d16e2c6faf4b4bfb9049d3ad3b9a10fd7cc866d566f518f972999a";

const mockWebhookPayload = {
  operation: "create", 
  documentType: "product",
  productData: {
    _id: "test-prod-compiled-999",
    title: {
      en: "Compiled Heavy Duty Work Desk (Enterprise Edition v3)",
      fr: "Bureau lourd compilé Pro",
      ar: "مكتب عمل ميكانيكية مطور"
    },
    slug: "compiled-heavy-duty-work-desk",
    pricing: {
      dzd: 49500, // 💳 Algeria (Chargily DA)
      eur: 320,   // 💳 Europe (Stripe)
      usd: 340    // 💳 North America (Stripe)
    },
    stockCount: 140, // 📦 Sets quantity parameters safely
    weightGrams: 36500,
    lengthMm: 1200,
    widthMm: 800,
    heightMm: 750,
    originCountry: "DZ",
    categories: [],
    images: [],
    manage_inventory: true,
    allow_backorder: false
  }
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

console.log("🚀 Dispatching Local Webhook Simulation Pass directly into Medusa Engine...");

const req = http.request(options, (res) => {
  let data = "";
  res.on("data", (chunk) => { data += chunk; });
  res.on("end", () => {
    console.log(`\n✅ Transaction complete! Server Status Code: [${res.statusCode}]`);
    console.log("📄 Response Matrix:", JSON.parse(data));
  });
});

req.on("error", (e) => {
  console.error(`❌ Request execution collapsed: ${e.message}`);
});

req.write(payloadString);
req.end();
