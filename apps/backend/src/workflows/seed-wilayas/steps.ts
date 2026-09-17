import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import fs from "fs";
import path from "path";


interface RawGeoAlgeriaWilaya {
  code: string;
  name?: string;
  name_ar: string;
  name_fr: string;
}

interface WilayaRateCreateDTO {
  id: string;
  wilaya_code: number;
}

const wilayaEnglishNames: Record<number, string> = {
  1: "Adrar",
  2: "Chlef",
  3: "Laghouat",
  4: "Oum El Bouaghi",
  5: "Batna",
  6: "Béjaïa",
  7: "Biskra",
  8: "Béchar",
  9: "Blida",
  10: "Bouira",
  11: "Tamanrasset",
  12: "Tébessa",
  13: "Tlemcen",
  14: "Tiaret",
  15: "Tizi Ouzou",
  16: "Algiers",
  17: "Djelfa",
  18: "Jijel",
  19: "Sétif",
  20: "Saïda",
  21: "Skikda",
  22: "Sidi Bel Abbès",
  23: "Annaba",
  24: "Guelma",
  25: "Constantine",
  26: "Médéa",
  27: "Mostaganem",
  28: "M'Sila",
  29: "Mascara",
  30: "Ouargla",
  31: "Oran",
  32: "El Bayadh",
  33: "Illizi",
  34: "Bordj Bou Arréridj",
  35: "Boumerdès",
  36: "El Tarf",
  37: "Tindouf",
  38: "Tissemsilt",
  39: "El Oued",
  40: "Khenchela",
  41: "Souk Ahras",
  42: "Tipaza",
  43: "Mila",
  44: "Aïn Defla",
  45: "Naâma",
  46: "Aïn Témouchent",
  47: "Ghardaïa",
  48: "Relizane",
  49: "El M'Ghair",
  50: "El Meniaa",
  51: "Ouled Djellal",
  52: "Bordj Badji Mokhtar",
  53: "Béni Abbès",
  54: "In Salah",
  55: "In Guezzam",
  56: "Touggourt",
  57: "Djanet",
  58: "El Bayadh El Djadid",
  59: "Oum El Bouaghi El Djadid",
  60: "Sidi Bel Abbès El Djadid",
  61: "Khenchela El Djadid",
  62: "Naâma El Djadid",
  63: "Aïn Témouchent El Djadid",
  64: "Ghardaïa El Djadid",
  65: "Relizane El Djadid",
  66: "El M'Ghair El Djadid",
  67: "El Meniaa El Djadid",
  68: "Ouled Djellal El Djadid",
  69: "Souk Ahras El Djadid",
};

export async function seedWilayasStepHandler(
  _input: Record<string, unknown>,
  { container }: { container: MedusaContainer },
): Promise<StepResponse<{ success: boolean; count: number }>> {
  const dbService = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  let activeModuleService: any;
  
  try {
    activeModuleService = container.resolve("algerianLogisticsModuleService");
  } catch {
    try {
      activeModuleService = container.resolve("algerian_logistics_module_service" as any);
    } catch {
      activeModuleService = container.resolve("wilaya_rate_module_service" as any);
    }
  }

  if (!activeModuleService) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "CRITICAL: Could not resolve the Algerian Logistics module service token from the Medusa container. Please verify its definition key inside medusa-config.ts."
    );
  }

  const createdRecords: string[] = [];

  try {
    const regionModuleService = container.resolve(Modules.REGION);

    // Resolved variable re-assignment limitation by working directly with the returned array tuple
    const resultTuple = await regionModuleService.listAndCountRegions({
      currency_code: "dzd",
    });
    
    let regionsList = resultTuple[0];

    if (regionsList.length === 0) {
      logger.info(
        "Initializing official Algerian Region (DZD) context parameters...",
      );
      const newRegion = await regionModuleService.createRegions({
        name: "Algeria",
        currency_code: "dzd",
        countries: ["dz"],
      });
      regionsList = Array.isArray(newRegion) ? newRegion : [newRegion];
    }

    const targetRegionId = regionsList[0].id;

    const packageMainEntryPath = require.resolve("geoalgeria");
    const packageRootPath = path.dirname(packageMainEntryPath);
    const packageDataPath = path.join(packageRootPath, "data", "wilayas.json");

    if (!fs.existsSync(packageDataPath)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `The target data path does not exist: ${packageDataPath}`,
      );
    }

    const rawData = fs.readFileSync(packageDataPath, "utf-8");
    const parsedData = JSON.parse(rawData);
    let geoWilayas: RawGeoAlgeriaWilaya[] = [];
    if (Array.isArray(parsedData)) {
      geoWilayas = parsedData;
    } else if (parsedData && typeof parsedData === "object") {
      geoWilayas = parsedData.wilayas || Object.values(parsedData);
    }

    if (!Array.isArray(geoWilayas) || geoWilayas.length === 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Parsed wilaya data structure is invalid or empty. Expected an iterable array.`,
      );
    }

    logger.info(
      `Injecting localized assets for ${geoWilayas.length} validated Algerian regions...`,
    );

    for (const wilaya of geoWilayas) {
      if (!wilaya || typeof wilaya !== "object" || !("code" in wilaya)) {
        continue;
      }
      const code = Number(wilaya.code);
      if (isNaN(code)) continue;
      const translatedEnName = wilayaEnglishNames[code] || wilaya.name_fr || "Unknown";

      const basePayload = {
        wilaya_code: code,
        wilaya_name_en: translatedEnName,
        wilaya_name_fr: wilaya.name_fr,
        wilaya_name_ar: wilaya.name_ar,
        home_price: 70000,
        desk_price: 40000,
        is_active: true,
        region_id: targetRegionId, 
      };

      const {
        data: [existing],
      } = await dbService.graph({
        entity: "wilaya_rate",
        fields: ["id"],
        filters: { wilaya_code: code },
      });

      if (!existing) {
        const records = (await activeModuleService.createWilayaRates([
          basePayload,
        ])) as WilayaRateCreateDTO[];

        if (records && records.length > 0) {
          const firstRecord = records[0];
          if (firstRecord && firstRecord.id) {
            createdRecords.push(firstRecord.id);
          }
        }
      }
    }

    logger.info(
      `Successfully mapped and committed ${createdRecords.length} new structural Wilaya entries.`,
    );
    return new StepResponse({ success: true, count: createdRecords.length });
  } catch (error) {
    const isMedusaError = error instanceof MedusaError;
    const errorMessage = isMedusaError ? error.message : String(error);
    const cleanErrorObject = isMedusaError
      ? error
      : new MedusaError(MedusaError.Types.DB_ERROR, errorMessage);

    logger.error(
      `[SEED_WILAYAS_STEP_CRASH]: ${errorMessage}`,
      cleanErrorObject,
    );
    return new StepResponse({ success: false, count: 0 });
  }
}


export const seedWilayasStep = createStep(
  "seed-wilayas",
  seedWilayasStepHandler,
);
