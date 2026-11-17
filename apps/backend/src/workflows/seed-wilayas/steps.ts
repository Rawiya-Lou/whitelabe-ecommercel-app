import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import dz from "geoalgeria";
import { ALGERIAN_LOGISTICS_MODULE } from "../../modules/algerian-logistics";
import type AlgerianLogisticsModuleService from "../../modules/algerian-logistics/service";
import {
  MOTHER_WILAYA_CODES,
  WILAYA_ENGLISH_NAMES,
} from "../../modules/algerian-logistics/constants";

export async function seedWilayasStepHandler(
  _input: Record<string, unknown>,
  { container }: { container: MedusaContainer }
): Promise<StepResponse<{ success: boolean; count: number }>> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const logisticsService = container.resolve<AlgerianLogisticsModuleService>(
    ALGERIAN_LOGISTICS_MODULE
  );
  const regionModuleService = container.resolve(Modules.REGION);

  const [regionsListInitial] = await regionModuleService.listAndCountRegions({
    currency_code: "dzd",
  });

  let regionsList = regionsListInitial;
  if (regionsList.length === 0) {
    logger.info("Initializing official Algerian Region (DZD)...");
    const created = await regionModuleService.createRegions({
      name: "Algeria",
      currency_code: "dzd",
      countries: ["dz"],
    });
    regionsList = Array.isArray(created) ? created : [created];
  }

  const targetRegionId = regionsList[0].id;
  const geoWilayas = dz.wilayas;

  if (!Array.isArray(geoWilayas) || geoWilayas.length === 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "geoalgeria returned an empty or invalid wilayas dataset."
    );
  }

  let createdCount = 0;

  for (const w of geoWilayas) {
    const code = Number(w.code);
    if (Number.isNaN(code) || code < 1 || code > 69) continue;

    const existing = await logisticsService.listWilayaRates({
      wilaya_code: code,
    });
    if (existing.length > 0) continue;

    await logisticsService.createWilayaRates({
      wilaya_code: code,
      mother_wilaya_code: MOTHER_WILAYA_CODES[code] ?? null,
      wilaya_name_en: WILAYA_ENGLISH_NAMES[code] || w.name_fr,
      wilaya_name_fr: w.name_fr,
      wilaya_name_ar: w.name_ar,
      home_price: 700, // 700 DZD (major units)
      desk_price: 400, // 400 DZD (major units)
      is_active: true,
      region_id: targetRegionId,
    });
    createdCount++;
  }

  logger.info(
    `Seeded ${createdCount} new Algerian Wilayas (total dataset: ${geoWilayas.length}).`
  );

  return new StepResponse({ success: true, count: createdCount });
}

export const seedWilayasStep = createStep(
  "seed-wilayas",
  seedWilayasStepHandler
);