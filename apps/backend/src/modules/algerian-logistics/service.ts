import { MedusaError, MedusaService } from "@medusajs/framework/utils";
import WilayaRate, { CommuneOverride } from "./models/wilayaRate";
import { normalizeLocationKey } from "./constants";

export type DeliveryMode = "home" | "desk";

export interface DeliveryQuoteResult {
  wilaya_code: number;
  carrier_wilaya_code: number;
  delivery_mode: DeliveryMode;
  amount: number; // Major DZD units (e.g., 700)
  currency_code: "dzd";
}

class AlgerianLogisticsModuleService extends MedusaService({
  WilayaRate,
  CommuneOverride,
}) {
  async resolveDeliveryQuote(input: {
    wilaya_code: number;
    commune_name_fr?: string | null;
    delivery_mode: DeliveryMode;
  }): Promise<DeliveryQuoteResult> {
    const [wilaya] = await this.listWilayaRates(
      { wilaya_code: input.wilaya_code },
      { relations: ["overrides"] }
    );

    if (!wilaya || !wilaya.is_active) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Delivery is not available for wilaya ${input.wilaya_code}.`
      );
    }

    let homePrice = Number(wilaya.home_price);
    let deskPrice = Number(wilaya.desk_price);

    if (input.commune_name_fr && Array.isArray(wilaya.overrides)) {
      const targetKey = normalizeLocationKey(input.commune_name_fr);
      const override = wilaya.overrides.find(
        (o) =>
          o.commune_key === targetKey ||
          normalizeLocationKey(o.commune_name_fr) === targetKey
      );

      if (override) {
        if (!override.is_active) {
          throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            `Delivery is currently disabled for commune "${input.commune_name_fr}".`
          );
        }
        homePrice = Number(override.home_delivery_price);
        deskPrice = Number(override.stop_desk_price);
      }
    }

    const amount = input.delivery_mode === "desk" ? deskPrice : homePrice;

    return {
      wilaya_code: wilaya.wilaya_code,
      carrier_wilaya_code: wilaya.mother_wilaya_code ?? wilaya.wilaya_code,
      delivery_mode: input.delivery_mode,
      amount,
      currency_code: "dzd",
    };
  }
}

export default AlgerianLogisticsModuleService;