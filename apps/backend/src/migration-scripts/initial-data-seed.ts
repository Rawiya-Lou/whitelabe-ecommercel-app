import type { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  MedusaError,
  ModuleRegistrationName,
  Modules,
} from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createStoresWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  type CreateShippingOptionsWorkflowInput,
} from "@medusajs/medusa/core-flows";
import { seedWilayasWorkflow } from "../workflows/seed-wilayas/index";

const EU_COUNTRIES = ["gb", "de", "dk", "se", "fr", "es", "it", "be", "nl"];
const NA_COUNTRIES = ["us", "ca"];
const DZ_COUNTRIES = ["dz"];
const ALL_COUNTRIES = [...DZ_COUNTRIES, ...EU_COUNTRIES, ...NA_COUNTRIES];

const SUPPORTED_LOCALES = ["en", "fr", "ar"] as const;

export default async function initial_data_seed({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(
    ModuleRegistrationName.FULFILLMENT
  );
  const storeModuleService = container.resolve(Modules.STORE);
  const regionModuleService = container.resolve(Modules.REGION);
  const stockLocationModuleService = container.resolve(Modules.STOCK_LOCATION);

  const warehouseCountry = (
    process.env.STORE_WAREHOUSE_COUNTRY || "DZ"
  ).toUpperCase();
  const isAlgeriaPrimary = warehouseCountry === "DZ";
  const defaultLocale = (
    process.env.STORE_DEFAULT_LOCALE || "en"
  ).toLowerCase();

  logger.info("Starting idempotent white-label store seed...");

  // -------------------------------------------------------------------------
  // 1. Sales Channel
  // -------------------------------------------------------------------------
  let defaultSalesChannel: { id: string; name: string };
  const { data: existingChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  });

  if (existingChannels.length > 0) {
    defaultSalesChannel = existingChannels[0];
    logger.info(`Using existing sales channel: [${defaultSalesChannel.name}]`);
  } else {
    const {
      result: [newChannel],
    } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [
          {
            name: "Default Sales Channel",
            description: "Primary white-label storefront channel",
          },
        ],
      },
    });
    defaultSalesChannel = newChannel;
    logger.info(`Created sales channel: [${defaultSalesChannel.name}]`);
  }

  // -------------------------------------------------------------------------
  // 2. Publishable API Key + Sales Channel Link
  // -------------------------------------------------------------------------
  let publishableApiKey: { id: string; title: string; token?: string };
  const { data: existingKeys } = await query.graph({
    entity: "api_key",
    fields: ["id", "title", "token", "sales_channels.id"],
    filters: { type: "publishable" },
  });

  if (existingKeys.length > 0) {
    publishableApiKey = existingKeys[0];
    const linkedChannelIds = new Set(
      ((existingKeys[0] as { sales_channels?: { id: string }[] }).sales_channels ?? []).map(
        (sc) => sc.id
      )
    );
    if (!linkedChannelIds.has(defaultSalesChannel.id)) {
      await linkSalesChannelsToApiKeyWorkflow(container).run({
        input: {
          id: publishableApiKey.id,
          add: [defaultSalesChannel.id],
        },
      });
    }
    logger.info(`Using existing publishable API key: [${publishableApiKey.title}]`);
  } else {
    const {
      result: [newApiKey],
    } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          {
            title: "Storefront Publishable Key",
            type: "publishable",
            created_by: "system-seed",
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
      `Created publishable API key [${publishableApiKey.title}] (token: ${publishableApiKey.token})`
    );
  }

  // -------------------------------------------------------------------------
  // 3. Store Configuration (Currencies + Multilingual White-Label Metadata)
  // -------------------------------------------------------------------------
  const [existingStore] = await storeModuleService.listStores();
  const targetCurrencies = [
    { currency_code: "dzd", is_default: isAlgeriaPrimary },
    { currency_code: "eur", is_default: !isAlgeriaPrimary },
    { currency_code: "usd", is_default: false },
  ];

  const storeMetadata = {
    default_locale: SUPPORTED_LOCALES.includes(
      defaultLocale as (typeof SUPPORTED_LOCALES)[number]
    )
      ? defaultLocale
      : "en",
    supported_locales: [...SUPPORTED_LOCALES],
    warehouse_country: warehouseCountry,
  };

  if (existingStore) {
    await storeModuleService.updateStores(existingStore.id, {
      name: process.env.STORE_NAME || existingStore.name,
      supported_currencies: targetCurrencies,
      default_sales_channel_id: defaultSalesChannel.id,
      metadata: {
        ...(existingStore.metadata ?? {}),
        ...storeMetadata,
      },
    });
    logger.info("Updated store currencies and multilingual white-label metadata.");
  } else {
    await createStoresWorkflow(container).run({
      input: {
        stores: [
          {
            name: process.env.STORE_NAME || "White-Label Store",
            supported_currencies: targetCurrencies,
            default_sales_channel_id: defaultSalesChannel.id,
            metadata: storeMetadata,
          },
        ],
      },
    });
    logger.info("Created new white-label store.");
  }

  // -------------------------------------------------------------------------
  // 4. Regions (Create only missing regions by currency_code)
  // -------------------------------------------------------------------------
  const existingRegions = await regionModuleService.listRegions();
  const existingCurrencies = new Set(
    existingRegions.map((r) => r.currency_code.toLowerCase())
  );

  const regionsToCreate: Array<{
    name: string;
    currency_code: string;
    countries: string[];
    payment_providers: string[];
  }> = [];

  if (!existingCurrencies.has("dzd")) {
    regionsToCreate.push({
      name: "Algeria",
      currency_code: "dzd",
      countries: DZ_COUNTRIES,
      payment_providers: ["pp_system_default", "pp_chargily_chargily"],
    });
  }
  if (!existingCurrencies.has("eur")) {
    regionsToCreate.push({
      name: "Europe",
      currency_code: "eur",
      countries: EU_COUNTRIES,
      payment_providers: ["pp_stripe_stripe"],
    });
  }
  if (!existingCurrencies.has("usd")) {
    regionsToCreate.push({
      name: "North America",
      currency_code: "usd",
      countries: NA_COUNTRIES,
      payment_providers: ["pp_stripe_stripe"],
    });
  }

  if (regionsToCreate.length > 0) {
    await createRegionsWorkflow(container).run({
      input: { regions: regionsToCreate },
    });
    logger.info(`Created ${regionsToCreate.length} region(s).`);
  } else {
    logger.info("All target regions (DZD, EUR, USD) already exist.");
  }

  // -------------------------------------------------------------------------
  // 5. Tax Regions (Idempotent — create only missing countries)
  // -------------------------------------------------------------------------
  const { data: existingTaxRegions } = await query.graph({
    entity: "tax_region",
    fields: ["id", "country_code"],
  });
  const existingTaxCountries = new Set(
    existingTaxRegions.map((tr) => tr.country_code?.toLowerCase())
  );
  const missingTaxCountries = ALL_COUNTRIES.filter(
    (c) => !existingTaxCountries.has(c)
  );

  if (missingTaxCountries.length > 0) {
    await createTaxRegionsWorkflow(container).run({
      input: missingTaxCountries.map((country_code) => ({
        country_code,
        provider_id: "tp_system",
      })),
    });
    logger.info(`Created ${missingTaxCountries.length} tax region(s).`);
  }

  // -------------------------------------------------------------------------
  // 6. Stock Location + Sales Channel Link
  // -------------------------------------------------------------------------
  let stockLocation: { id: string; name: string };
  const existingLocations = await stockLocationModuleService.listStockLocations(
    {}
  );

  if (existingLocations.length === 0) {
    const warehouseName =
      process.env.STORE_WAREHOUSE_NAME || "Main Fulfillment Warehouse";
    const { result: createdLocations } = await createStockLocationsWorkflow(
      container
    ).run({
      input: {
        locations: [
          {
            name: warehouseName,
            address: {
              city: process.env.STORE_WAREHOUSE_CITY || "Algiers",
              country_code: warehouseCountry,
              address_1:
                process.env.STORE_WAREHOUSE_ADDRESS || "Main Logistics Hub",
            },
          },
        ],
      },
    });
    stockLocation = createdLocations[0];
    logger.info(`Created stock location: [${warehouseName}]`);
  } else {
    stockLocation = existingLocations[0];
    logger.info(`Using existing stock location: [${stockLocation.name}]`);
  }

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [defaultSalesChannel.id],
    },
  });

  // -------------------------------------------------------------------------
  // 7. Resolve Registered Fulfillment Providers Dynamically & Link to Location
  // -------------------------------------------------------------------------
  const { data: registeredProviders } = await query.graph({
    entity: "fulfillment_provider",
    fields: ["id"],
  });
  const providerIds = new Set(registeredProviders.map((p) => p.id));

  const manualProviderId =
    providerIds.has("fp_manual_manual")
      ? "fp_manual_manual"
      : [...providerIds].find((id) => id.includes("manual"));

  const algerianProviderId =
    providerIds.has("fp_algerian-fulfillment_algerian")
      ? "fp_algerian-fulfillment_algerian"
      : [...providerIds].find((id) => id.includes("algerian"));

  if (!manualProviderId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Manual fulfillment provider not found. Registered providers: ${[...providerIds].join(", ")}`
    );
  }

  const providersToLink = [manualProviderId, algerianProviderId].filter(
    (id): id is string => Boolean(id)
  );

  for (const providerId of providersToLink) {
    try {
      await link.create({
        [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
        [Modules.FULFILLMENT]: { fulfillment_provider_id: providerId },
      });
    } catch {
      // Link already exists
    }
  }

  // -------------------------------------------------------------------------
  // 8. Default Shipping Profile
  // -------------------------------------------------------------------------
  const { data: existingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });

  let shippingProfileId: string;
  if (existingProfiles.length > 0) {
    shippingProfileId = existingProfiles[0].id;
  } else {
    const {
      result: [newProfile],
    } = await createShippingProfilesWorkflow(container).run({
      input: {
        data: [
          {
            name: "Default Shipping Profile",
            type: "default",
          },
        ],
      },
    });
    shippingProfileId = newProfile.id;
  }

  // -------------------------------------------------------------------------
  // 9. Fulfillment Set & Service Zones (DZ, EU, NA)
  // -------------------------------------------------------------------------
  const setName = "Global Dynamic Delivery Network";
  let existingSets = await fulfillmentModuleService.listFulfillmentSets(
    { name: setName },
    { relations: ["service_zones"] }
  );

  if (existingSets.length === 0) {
    const createdSet = await fulfillmentModuleService.createFulfillmentSets({
      name: setName,
      type: "shipping",
      service_zones: [
        {
          name: "Algeria Zone",
          geo_zones: DZ_COUNTRIES.map((c) => ({
            country_code: c,
            type: "country" as const,
          })),
        },
        {
          name: "Europe Zone",
          geo_zones: EU_COUNTRIES.map((c) => ({
            country_code: c,
            type: "country" as const,
          })),
        },
        {
          name: "North America Zone",
          geo_zones: NA_COUNTRIES.map((c) => ({
            country_code: c,
            type: "country" as const,
          })),
        },
      ],
    });
    existingSets = [createdSet];
  }

  const fulfillmentSet = existingSets[0];

  try {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
    });
  } catch {
    // Link already exists
  }

  const dzZone = fulfillmentSet.service_zones.find(
    (z) => z.name === "Algeria Zone"
  );
  const euZone = fulfillmentSet.service_zones.find(
    (z) => z.name === "Europe Zone"
  );
  const naZone = fulfillmentSet.service_zones.find(
    (z) => z.name === "North America Zone"
  );

  if (!dzZone || !euZone || !naZone) {
    throw new MedusaError(
      MedusaError.Types.DB_ERROR,
      "Required service zones (Algeria, Europe, North America) are missing from fulfillment set."
    );
  }

  // -------------------------------------------------------------------------
  // 10. Shipping Options (Idempotent by type.code)
  // -------------------------------------------------------------------------
  const { data: existingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "service_zone_id", "type.code"],
  });

  const existingCodes = new Set(
    existingOptions
      .map((o) => (o as { type?: { code?: string } }).type?.code)
      .filter((code): code is string => Boolean(code))
  );

  const dzProviderId = algerianProviderId || manualProviderId;
  const dzIsCalculated = Boolean(algerianProviderId);

  const desiredShippingOptions: CreateShippingOptionsWorkflowInput = [
    // DZ Option 1: Home Delivery (Domicile)
    {
      name: "Home Delivery (Domicile)",
      price_type: dzIsCalculated ? "calculated" : "flat",
      provider_id: dzProviderId,
      service_zone_id: dzZone.id,
      shipping_profile_id: shippingProfileId,
      type: {
        label: "Home Delivery",
        description: "Door-to-door delivery across 69 Algerian Wilayas",
        code: "dz_home",
      },
      data: dzIsCalculated
        ? { id: "algerian-home-delivery", delivery_mode: "home" }
        : undefined,
      prices: dzIsCalculated ? [] : [{ currency_code: "dzd", amount: 700 }],
      rules: [
        { attribute: "enabled_in_store", value: "true", operator: "eq" },
        { attribute: "is_return", value: "false", operator: "eq" },
      ],
    },
    // DZ Option 2: Stop-Desk Pickup
    {
      name: "Stop-Desk Pickup",
      price_type: dzIsCalculated ? "calculated" : "flat",
      provider_id: dzProviderId,
      service_zone_id: dzZone.id,
      shipping_profile_id: shippingProfileId,
      type: {
        label: "Stop-Desk",
        description: "Pickup at local carrier stop-desk across 69 Wilayas",
        code: "dz_desk",
      },
      data: dzIsCalculated
        ? { id: "algerian-stop-desk", delivery_mode: "desk" }
        : undefined,
      prices: dzIsCalculated ? [] : [{ currency_code: "dzd", amount: 400 }],
      rules: [
        { attribute: "enabled_in_store", value: "true", operator: "eq" },
        { attribute: "is_return", value: "false", operator: "eq" },
      ],
    },
    // Europe Flat Rate
    {
      name: "Standard Europe Shipping",
      price_type: "flat",
      provider_id: manualProviderId,
      service_zone_id: euZone.id,
      shipping_profile_id: shippingProfileId,
      type: {
        label: "Euro Standard",
        description: "Standard European delivery",
        code: "eu_standard",
      },
      prices: [{ currency_code: "eur", amount: 15 }],
      rules: [
        { attribute: "enabled_in_store", value: "true", operator: "eq" },
        { attribute: "is_return", value: "false", operator: "eq" },
      ],
    },
    // North America Flat Rate
    {
      name: "Standard North America Shipping",
      price_type: "flat",
      provider_id: manualProviderId,
      service_zone_id: naZone.id,
      shipping_profile_id: shippingProfileId,
      type: {
        label: "NA Standard",
        description: "Standard North American delivery",
        code: "na_standard",
      },
      prices: [{ currency_code: "usd", amount: 20 }],
      rules: [
        { attribute: "enabled_in_store", value: "true", operator: "eq" },
        { attribute: "is_return", value: "false", operator: "eq" },
      ],
    },
  ];

  const missingOptions = desiredShippingOptions.filter((opt) => {
    const code = opt.type?.code;
    return code ? !existingCodes.has(code) : true;
  });

  if (missingOptions.length > 0) {
    await createShippingOptionsWorkflow(container).run({
      input: missingOptions,
    });
    logger.info(`Created ${missingOptions.length} new shipping option(s).`);
  } else {
    logger.info("All regional shipping options already exist.");
  }

  // -------------------------------------------------------------------------
  // 11. Seed 69 Algerian Wilayas & Base Rates
  // -------------------------------------------------------------------------
  await seedWilayasWorkflow(container).run({ input: {} });

  logger.info("White-label store seed completed successfully.");
}