import path from "path";
import {
  loadEnv,
  defineConfig,
  MedusaError,
} from "@medusajs/framework/utils";
import { getBackendPublicUrl } from "./src/utils/backend-url";
import { getSanityConfig } from "./src/modules/sanity-sync/config";

const envDir = __dirname.includes(".medusa")
  ? path.resolve(__dirname, "../..")
  : process.cwd();

loadEnv(process.env.NODE_ENV || "development", envDir);

const isProd = process.env.NODE_ENV === "production";
const isBuildPhase =
  process.argv.includes("build") || process.env.SKIP_ENV_VALIDATION === "1";
const shouldValidateRuntime = isProd && !isBuildPhase;

const workerMode =
  ((process.env.MEDUSA_WORKER_MODE || process.env.WORKER_MODE) as
    "shared" | "worker" | "server") || "shared";

const storefrontUrl = process.env.STOREFRONT_URL || "http://localhost:3000";
const backendPublicUrl = getBackendPublicUrl();
const redisNamespacePrefix = isProd ? "prod_" : "dev_";
const redisUrl = shouldValidateRuntime ? process.env.REDIS_URL : undefined;
const isHttps = (backendPublicUrl || "").startsWith("https://");
const requestedSameSite =
  (process.env.COOKIE_SAME_SITE as "lax" | "strict" | "none") || "lax";


const dbUrl = process.env.DATABASE_URL || "";
const isLocalDb =
  dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");

const {
  projectId: sanityProjectId,
  dataset: sanityDataset,
  apiToken: sanityApiToken,
} = getSanityConfig();

// Enforce ALL critical runtime secrets on boot (skipped safely during `medusa build`)
if (shouldValidateRuntime) {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!redisUrl) missing.push("REDIS_URL");
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "supersecret") {
    missing.push("JWT_SECRET");
  }
  if (
    !process.env.COOKIE_SECRET ||
    process.env.COOKIE_SECRET === "supersecret"
  ) {
    missing.push("COOKIE_SECRET");
  }
  if (!process.env.STORE_CORS) missing.push("STORE_CORS");
  if (!process.env.ADMIN_CORS) missing.push("ADMIN_CORS");
  if (!process.env.AUTH_CORS) missing.push("AUTH_CORS");
  if (!sanityProjectId) missing.push("SANITY_PROJECT_ID");
  if (!sanityDataset) missing.push("SANITY_DATASET");
  if (!sanityApiToken) missing.push("SANITY_API_TOKEN");
  if (!process.env.STRIPE_API_KEY) missing.push("STRIPE_API_KEY");
  if (!process.env.STRIPE_WEBHOOK_SECRET) missing.push("STRIPE_WEBHOOK_SECRET");
  if (!process.env.CHARGILY_SECRET_KEY) missing.push("CHARGILY_SECRET_KEY");
  // if (!process.env.S3_BUCKET) missing.push("S3_BUCKET");

  if (missing.length > 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Missing required production environment variables: ${missing.join(", ")}`,
    );
  }
}

const sharedRedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  keepAlive: 10000,
  retryStrategy(times: number) {
    return Math.min(times * 100, 3000);
  },
  reconnectOnError(err: Error) {
    if (
      err.message.startsWith("READONLY") ||
      err.message.includes("Connection is closed")
    ) {
      return true;
    }
    return false;
  },
};

const productionRedisModules = shouldValidateRuntime
  ? [
      {
        resolve: "@medusajs/medusa/event-bus-redis",
        options: {
          redisUrl,
          queueOptions: { prefix: redisNamespacePrefix },
          workerOptions: { prefix: redisNamespacePrefix },
          redisOptions: sharedRedisOptions,
        },
      },
      {
        resolve: "@medusajs/medusa/workflow-engine-redis",
        options: {
          redis: {
            redisUrl,
            ...sharedRedisOptions,
          },
        },
      },
      {
        resolve: "@medusajs/medusa/locking",
        options: {
          providers: [
            {
              resolve: "@medusajs/medusa/locking-redis",
              id: "locking-redis",
              is_default: true,
              options: {
                redisUrl,
              },
            },
          ],
        },
      },
      {
        resolve: "@medusajs/medusa/cache-redis",
        options: {
          redisUrl,
        },
      },
    ]
  : [
      {
        resolve: "@medusajs/medusa/event-bus-local",
        options: {},
      },
    ];

const fileProvider = process.env.S3_BUCKET
    ? {
        resolve: "@medusajs/medusa/file-s3",
        id: "s3",
        options: {
          file_url: process.env.S3_FILE_URL,
          access_key_id: process.env.S3_ACCESS_KEY_ID,
          secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
          region: process.env.S3_REGION,
          bucket: process.env.S3_BUCKET,
          endpoint: process.env.S3_ENDPOINT,
          acl: process.env.S3_ACL === "public-read" ? "public-read" : false,
          additional_client_config:
            process.env.S3_FORCE_PATH_STYLE === "true"
              ? { forcePathStyle: true }
              : undefined,
        },
      }
    : {
        resolve: "@medusajs/medusa/file-local",
        id: "local",
        options: {
          upload_dir: "static",
          backend_url: `${backendPublicUrl || "http://localhost:9000"}/static`,
        },
      };

export default defineConfig({
  projectConfig: {
    databaseUrl:
      process.env.DATABASE_URL ||
      (isBuildPhase
        ? "postgres://build:build@localhost:5432/medusa_build"
        : undefined),
    redisUrl,
    workerMode,
    databaseDriverOptions: isLocalDb
  ? {
      connection: { ssl: false },
    }
  : {
      connection: {
        ssl: { rejectUnauthorized: true },
      },
      pool: {
        min: 2,
        max: workerMode === "worker" ? 5 : 10,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 60000,
      },
      keepAlive: true,
      statement_timeout: 60000,
      idle_in_transaction_session_timeout: 60000,
    },
    cookieOptions: {
      sameSite: isHttps ? requestedSameSite : "lax",
      secure: isProd && isHttps,
    },
    http: {
      storeCors: isProd
        ? process.env.STORE_CORS!
        : process.env.STORE_CORS || "/.*/",
      adminCors: isProd
        ? process.env.ADMIN_CORS!
        : process.env.ADMIN_CORS || "/.*/",
      authCors: isProd
        ? process.env.AUTH_CORS!
        : process.env.AUTH_CORS || "/.*/",
      jwtSecret:
        process.env.JWT_SECRET || (isProd ? undefined : "dev_jwt_secret"),
      cookieSecret:
        process.env.COOKIE_SECRET || (isProd ? undefined : "dev_cookie_secret"),
    },
  },

  modules: [
    ...productionRedisModules,
    {
      resolve: "@medusajs/medusa/file",
      options: { providers: [fileProvider] },
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
              successUrl: `${storefrontUrl}/checkout/pending`,
              failureUrl: `${storefrontUrl}/checkout/failed`,
              isTestMode: process.env.CHARGILY_IS_TEST_MODE
                ? process.env.CHARGILY_IS_TEST_MODE === "true"
                : !isProd,
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
    disable:
      process.env.MEDUSA_ADMIN_DASHBOARD_DISABLED === "true" ||
      workerMode === "worker",
    path: "/app",
    backendUrl: backendPublicUrl || undefined,
  },
});
