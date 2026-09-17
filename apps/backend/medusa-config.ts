import { loadEnv, defineConfig } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

const config = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL || undefined,
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
      secure: false,
    },
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    },
  },

  modules: [
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

module.exports = config;
