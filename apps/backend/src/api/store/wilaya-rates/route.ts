import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ALGERIAN_LOGISTICS_MODULE } from "../../../modules/algerian-logistics";
import type AlgerianLogisticsModuleService from "../../../modules/algerian-logistics/service";


/*
GET /store/wilaya-rates + resolveUiDeliveryPrice() (Client UI): Gives your checkout page instant 0ms price updates when the user clicks Wilayas/Communes without firing a POST request on every dropdown change
*/

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const logisticsService = req.scope.resolve<AlgerianLogisticsModuleService>(
    ALGERIAN_LOGISTICS_MODULE
  );

  const rates = await logisticsService.listWilayaRates(
    { is_active: true },
    {
      relations: ["overrides"],
      order: { wilaya_code: "ASC" },
    }
  );

  res.status(200).json({
    wilaya_rates: rates.map((rate) => ({
      wilaya_code: rate.wilaya_code,
      wilaya_name_en: rate.wilaya_name_en,
      wilaya_name_fr: rate.wilaya_name_fr,
      wilaya_name_ar: rate.wilaya_name_ar,
      home_price: Number(rate.home_price),
      desk_price: Number(rate.desk_price),
      overrides: (rate.overrides ?? []).map((o) => ({
        commune_name_fr: o.commune_name_fr,
        commune_name_ar: o.commune_name_ar,
        commune_name_en: o.commune_name_fr,
        home_delivery_price: Number(o.home_delivery_price),
        stop_desk_price: Number(o.stop_desk_price),
        is_active: o.is_active,
      })),
    })),
  });
}