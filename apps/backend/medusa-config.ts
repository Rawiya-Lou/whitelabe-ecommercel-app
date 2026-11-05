import { loadEnv, defineConfig, MedusaError } from "@medusajs/framework/utils";
import { getBackendPublicUrl } from "./src/utils/backend-url";
import { getSanityConfig } from "./src/modules/sanity-sync/config";

loadEnv(process.env.NODE_ENV || "development", process.cwd());
// If running locally, prefix with "dev_". If live, prefix with "prod_"
const isProd = process.env.NODE_ENV === "production";
const redisNamespacePrefix = isProd ? "prod_" : "dev_";
const redisUrl = isProd ? process.env.REDIS_URL : undefined;
const backendPublicUrl = getBackendPublicUrl();
const { projectId: sanityProjectId, dataset: sanityDataset, apiToken: sanityApiToken } =
  getSanityConfig();
if (
  isProd &&
  (!redisUrl || !sanityProjectId || !sanityDataset || !sanityApiToken)
) {
  throw new MedusaError(
    MedusaError.Types.INVALID_DATA,
    "Production sync requires REDIS_URL, a Sanity project ID (SANITY_PROJECT_ID or SANITY_STUDIO_PROJECT_ID), a dataset (SANITY_DATASET or SANITY_STUDIO_DATASET), and SANITY_API_TOKEN.",
  );
}
const eventBusModuleConfig = isProd
  ? {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: {
        redisUrl: redisUrl,
        queueOptions: {
          prefix: redisNamespacePrefix,
        },
        redisOptions: {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          keepAlive: 10000,
          retryStrategy(times: number) {
            return Math.min(times * 100, 3000);
          },
          reconnectOnError(err: Error) {
            const targetError = "READONLY";
            if (err.message.slice(0, targetError.length) === targetError) {
              return true;
            }
            if (err.message.includes("Connection is closed")) {
              return true;
            }
            return false;
          },
        },
      },
    }
  : {
      // Free, in-memory local fallback queue for development workflows!
      resolve: "@medusajs/medusa/event-bus-local",
      options: {},
    };


const config = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: redisUrl,
     workerMode: (process.env.WORKER_MODE as "shared" | "worker" | "server") || "shared",

    databaseDriverOptions: {
      connection: {
        ssl: {
          rejectUnauthorized: false,
        },
      },
      keepAlive: true,
      statement_timeout: 60000, // Extend maximum execution query allowance to 60s
      idle_in_transaction_session_timeout: 60000,
    },
    cookieOptions: {
      sameSite: "lax",
      secure: isProd,
    },
    http: {
      storeCors: process.env.STORE_CORS || "/.*/",
      adminCors: process.env.ADMIN_CORS || "/.*/",
      authCors: process.env.AUTH_CORS || "/.*/",
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    },
  },

  modules: [
     eventBusModuleConfig,
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: {
              // Points directly to your static folder root inside apps/backend
              upload_dir: "static",
              backend_url: `${backendPublicUrl || "http://localhost:9000"}/static`,
            },
          },
        ],
      },
    },
     {
      resolve: "./src/modules/sanity-sync",
      options: {
        project_id: sanityProjectId || "",
        api_token: sanityApiToken || "",
        dataset: sanityDataset || "",
      },
    },
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/payment-stripe",
            id: "stripe",
            options: {
              apiKey: process.env.STRIPE_API_KEY,
              webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
              capture: true,
            },
          },

          {
            resolve: "./src/modules/payment-chargily",
            id: "chargily",
            options: {
              secretKey: process.env.CHARGILY_SECRET_KEY,
              successUrl: `${process.env.STORE_CORS}/checkout/confirmed`,
              failureUrl: `${process.env.STORE_CORS}/checkout/failed`,
              isTestMode: process.env.CHARGILY_IS_TEST_MODE
                ? process.env.CHARGILY_IS_TEST_MODE === "true"
                : true,
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/fulfillment-manual",
            id: "manual_manual",
          },
        ],
      },
    },
    {
      resolve: "./src/modules/algerian-logistics",
    },
  ],
  admin: {
    disable: process.env.MEDUSA_ADMIN_DASHBOARD_DISABLED === "true",
    path: "/app",
  },
});

export default config;
