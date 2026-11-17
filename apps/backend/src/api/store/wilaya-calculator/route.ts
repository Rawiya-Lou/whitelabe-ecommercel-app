import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/framework/types";
import { ALGERIAN_LOGISTICS_MODULE } from "../../../modules/algerian-logistics";
import type AlgerianLogisticsModuleService from "../../../modules/algerian-logistics/service";
import type { CalculateShippingInput } from "./validators";

/* 
POST /store/wilaya-calculator is a read-only shipping quote endpoint: given { wilaya_code, commune_name_fr, delivery_mode }, it looks up the price in Postgres and returns { shipping_cost, is_overridden, ... }
*/

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const logisticsService = req.scope.resolve<AlgerianLogisticsModuleService>(
    ALGERIAN_LOGISTICS_MODULE
  );
  const { wilaya_code, commune_name_fr, commune_name_ar, commune_name_en, delivery_mode } =
    req.validatedBody as CalculateShippingInput;

  try {
    const quote = await logisticsService.resolveDeliveryQuote({
      wilaya_code,
      commune_name_fr,
      delivery_mode,
    });

    const [rate] = await logisticsService.listWilayaRates({ wilaya_code });

    res.status(200).json({
      wilaya_code: quote.wilaya_code,
      carrier_wilaya_code: quote.carrier_wilaya_code,
      wilaya_names: {
        en: rate?.wilaya_name_en ?? "",
        fr: rate?.wilaya_name_fr ?? "",
        ar: rate?.wilaya_name_ar ?? "",
      },
      commune_name_fr,
      commune_name_en: commune_name_en ?? "", 
      commune_name_ar: commune_name_ar ?? "",
      delivery_mode: quote.delivery_mode,
      shipping_cost: quote.amount,
      currency_code: quote.currency_code,
    });
  } catch (error) {
    if (error instanceof MedusaError && error.type === MedusaError.Types.INVALID_DATA) {
      res.status(400).json({ message: error.message });
      return;
    }

    const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
    logger.error(
      `[WILAYA_CALCULATOR_CRASH]: ${error instanceof Error ? error.message : String(error)}`
    );
    res.status(500).json({ message: "Unable to calculate delivery quote." });
  }
}