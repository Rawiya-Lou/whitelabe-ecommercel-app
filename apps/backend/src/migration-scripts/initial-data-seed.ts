import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  MedusaError,
  ModuleRegistrationName,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createCollectionsWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductOptionsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  CreateShippingOptionsWorkflowInput,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createStoresWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  processImportChunksStep,
} from "@medusajs/medusa/core-flows";
import { seedWilayasWorkflow } from "../workflows/seed-wilayas";

export default async function initial_data_seed({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(
    ModuleRegistrationName.FULFILLMENT,
  );
  const storeModuleService = container.resolve(Modules.STORE);
  const regionModuleService = container.resolve(Modules.REGION);

  const stockLocationModuleService = container.resolve(Modules.STOCK_LOCATION);

  const countries = [
    "gb",
    "de",
    "dk",
    "se",
    "fr",
    "es",
    "it",
    "dz",
    "us",
    "ca",
  ];
  // This lets the current business switch to 'yalidine', 'zr-express', 'dhl', etc. via environmental configs
  const activeCarrierProvider =
    process.env.ACTIVE_SHIPPING_PROVIDER || "manual_manual";
  // If your home warehouse base is in Algeria, your primary delivery network is domestic
  const isAlgeriaDeployment =
    (process.env.STORE_WAREHOUSE_COUNTRY || "DZ").toUpperCase() === "DZ";

  logger.info("Seeding store data...");

  let defaultSalesChannel;

  const { data: existingChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  });
  if (existingChannels && existingChannels.length > 0) {
    defaultSalesChannel = existingChannels[0];
    logger.info(
      `Using existing default sales channel: [${defaultSalesChannel.name}]`,
    );
  } else {
    const {
      result: [newSalesChannel],
    } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [
          {
            name: "Default Sales Channel",
            description: "Created by Medusa",
          },
        ],
      },
    });
    defaultSalesChannel = newSalesChannel;
    logger.info("Sales channel generated smoothly.");
  }

  let publishableApiKey;
  const { data: existingKeys } = await query.graph({
    entity: "api_key",
    fields: ["id", "title"],
    filters: { type: "publishable" },
  });
  if (existingKeys && existingKeys.length > 0) {
    publishableApiKey = existingKeys[0];
    logger.info(
      `Using existing publishable API key: [${publishableApiKey.title}]`,
    );
  } else {
    const {
      result: [newApiKey],
    } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          {
            title: "Default Publishable API Key",
            type: "publishable",
            created_by: "",
          },
        ],
      },
    });
    publishableApiKey = newApiKey;

    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: {
        id: publishableApiKey.id,
        add: [defaultSalesChannel.id],
      },
    });

    logger.info(
      "Publishable API key and sales channel link created successfully.",
    );
  }

  const [existingStore] = await storeModuleService.listStores();

  const targetCurrencies = [
    {
      currency_code: "dzd",
      is_default: isAlgeriaDeployment,
    },
    {
      currency_code: "eur",
      is_default: !isAlgeriaDeployment,
    },
    {
      currency_code: "usd",
      is_default: false,
    },
  ];
  if (existingStore) {
    await storeModuleService.updateStores(existingStore.id, {
      supported_currencies: targetCurrencies,
    });
    logger.info(
      `Existing store updated with whitelabel currencies (DZD, EUR, USD).`,
    );
  } else {
    const {
      result: [newStore],
    } = await createStoresWorkflow(container).run({
      input: {
        stores: [
          {
            name: process.env.STORE_NAME || "Default Store",
            supported_currencies: targetCurrencies,
            default_sales_channel_id: defaultSalesChannel.id,
          },
        ],
      },
    });

    logger.info("New whitelabel store entity created successfully.");
  }

  logger.info("Seeding region data...");
  const existingRegions = await regionModuleService.listRegions();
  if (existingRegions.length === 0) {
    await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Algeria",
            currency_code: "dzd",
            countries: ["dz"],
            payment_providers: ["pp_system_default", "pp_chargily_chargily"],
          },
          {
            name: "Europe",
            currency_code: "eur",
            countries: ["gb", "de", "dk", "se", "fr", "es", "it"],
            payment_providers: ["pp_stripe_stripe"],
          },
          {
            name: "North America",
            currency_code: "usd",
            countries: ["us", "ca"],
            payment_providers: ["pp_stripe_stripe"],
          },
        ],
      },
    });
    logger.info("Finished seeding isolated dynamic regions.");
  } else {
    logger.info(
      "Regions already exist in the database, skipping region seeding.",
    );
  }

  logger.info("Finished seeding regions.");

  logger.info("Seeding tax regions...");
  try {
    await createTaxRegionsWorkflow(container).run({
      input: countries.map((country_code) => ({
        country_code,
        provider_id: "tp_system",
      })),
    });
    logger.info("Finished seeding tax regions.");
  } catch (e) {
    logger.info("Tax regions already initialized, skipping configuration.");
  }

  logger.info("Seeding stock location data...");
  let stockLocation;
  const existingLocations = await stockLocationModuleService.listStockLocations(
    {},
  );

  if (existingLocations.length === 0) {
    const warehouseName =
      process.env.STORE_WAREHOUSE_NAME || "Main Home Office Base";
    const warehouseCity = process.env.STORE_WAREHOUSE_CITY || "Algiers";
    const warehouseCountry = process.env.STORE_WAREHOUSE_COUNTRY || "DZ";

    const { result: stockLocationResult } = await createStockLocationsWorkflow(
      container,
    ).run({
      input: {
        locations: [
          {
            name: warehouseName,
            address: {
              city: warehouseCity,
              country_code: warehouseCountry?.toUpperCase(),
              address_1:
                process.env.STORE_WAREHOUSE_ADDRESS || "Home Office Base St",
            },
          },
        ],
      },
    });
    stockLocation = stockLocationResult[0];
    logger.info(`Stock Location initiated: [${warehouseName}]`);
  } else {
    stockLocation = existingLocations[0];
    logger.info(`Using existing stock location: [${stockLocation.name}]`);
  }

  const warehouseCountryCheck = process.env.STORE_WAREHOUSE_COUNTRY || "DZ";
  const targetFulfillmentProvider =
    warehouseCountryCheck.toUpperCase() === "DZ"
      ? "manual_manual"
      : "manual_manual";

  try {
    await link.create({
      [Modules.STOCK_LOCATION]: {
        stock_location_id: stockLocation.id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_provider_id: targetFulfillmentProvider,
      },
    });
  } catch (e) {
    logger.info("Fulfillment linkage already intact.");
  }

  logger.info("Seeding fulfillment data...");
  const { data: shippingProfileResult } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  const shippingProfile = shippingProfileResult[0];

  const setName = "Global Dynamic Delivery Network";
 
  interface FulfillmentServiceZoneDTO {
    id: string;
    name: string;
    geo_zones?: unknown[];
  }
  interface FulfillmentSetContainerDTO {
    id: string;
    name: string;
    service_zones: FulfillmentServiceZoneDTO[];
  }
   let fulfillmentSet: FulfillmentSetContainerDTO; 
  const existingSets = await fulfillmentModuleService.listFulfillmentSets(
    { name: setName },
    { relations: ["service_zones"] },
  );
  if (existingSets && existingSets.length > 0) {
    fulfillmentSet = existingSets[0] as unknown as FulfillmentSetContainerDTO;
  } else {
    logger.info("Seeding all three isolated regional delivery networks...");

    const createdSet = await fulfillmentModuleService.createFulfillmentSets({
      name: setName,
      type: "shipping",

      service_zones: [
        {
          name: "Algeria Zone",
          geo_zones: [{ country_code: "dz", type: "country" as const }],
        },
        {
          name: "Europe Zone",
          geo_zones: ["gb", "de", "dk", "se", "fr", "es", "it"].map((c) => ({
            country_code: c,
            type: "country" as const,
          })),
        },
        {
          name: "North America Zone",
          geo_zones: ["us", "ca"].map((c) => ({
            country_code: c,
            type: "country" as const,
          })),
        },
      ],
    });
    fulfillmentSet = createdSet as unknown as FulfillmentSetContainerDTO;
  }
  try {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
    });
  } catch (e) {}

  logger.info(
    "Compiling explicit shipping profiles for Algeria, Europe, and North America...",
  );

  const dzZone = fulfillmentSet.service_zones.find(
    (z: FulfillmentServiceZoneDTO) => z.name === "Algeria Zone",
  );
  const euZone = fulfillmentSet.service_zones.find(
    (z: FulfillmentServiceZoneDTO) => z.name === "Europe Zone",
  );
  const naZone = fulfillmentSet.service_zones.find(
    (z: FulfillmentServiceZoneDTO) => z.name === "North America Zone",
  );

  if (!dzZone || !euZone || !naZone) {
    throw new MedusaError(
      MedusaError.Types.DB_ERROR,
      "Critical Core Seeding Error: Failed to find required regional service zone targets.",
    );
  }

  const isCalculatedCarrier = activeCarrierProvider !== "manual_manual";
  const domesticPriceType = isCalculatedCarrier
    ? ("calculated" as const)
    : ("flat" as const);
  const shippingOptionsPayload: CreateShippingOptionsWorkflowInput = [
    // 1. 🇩🇿 ALGERIA LOCAL PROFILE
    {
      name: "Standard Ground Delivery",
      price_type: domesticPriceType,
      provider_id: activeCarrierProvider,
      service_zone_id: dzZone.id,
      shipping_profile_id: shippingProfile.id,
      type: {
        label: "Standard",
        description: "Dynamic domestic ground delivery.",
        code: "dz_standard",
      },
      prices: !isCalculatedCarrier ? [{ currency_code: "dzd", amount: 0 }] : [],
      rules: [
        { attribute: "enabled_in_store", value: "true", operator: "eq" },
        { attribute: "is_return", value: "false", operator: "eq" },
      ],
    },
    {
      name: "Standard Europe Shipping",
      price_type: "flat" as const,
      provider_id: "manual_manual",
      service_zone_id: euZone.id,
      shipping_profile_id: shippingProfile.id,
      type: {
        label: "Euro Standard",
        description: "Standard European postal routes.",
        code: "eu_standard",
      },
      prices: [{ currency_code: "eur", amount: 15 }],
      rules: [
        { attribute: "enabled_in_store", value: "true", operator: "eq" },
        { attribute: "is_return", value: "false", operator: "eq" },
      ],
    },
    {
      name: "Standard North America Shipping",
      price_type: "flat" as const,
      provider_id: "manual_manual",
      service_zone_id: naZone.id,
      shipping_profile_id: shippingProfile.id,
      type: {
        label: "NA Standard",
        description: "Ground cross-border logistics.",
        code: "na_standard",
      },
      prices: [{ currency_code: "usd", amount: 20 }],
      rules: [
        { attribute: "enabled_in_store", value: "true", operator: "eq" },
        { attribute: "is_return", value: "false", operator: "eq" },
      ],
    },
  ];

  try {
    await createShippingOptionsWorkflow(container).run({
      input: shippingOptionsPayload,
    });
    logger.info("Finished seeding fulfillment data.");
  } catch (e) {
    logger.info("Shipping configuration entries already synchronized.");
  }

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [defaultSalesChannel.id],
    },
  });
  logger.info("Finished seeding stock location data.");

  await seedWilayasWorkflow(container).run({
    input: {},
  });

  logger.info(
    "Finished seeding whitelabel systemic structural defaults perfectly.",
  );
  logger.info(
    "Catalog inventory layer left clear. Sanity CMS sync pipeline will stream items dynamically.",
  );
}
