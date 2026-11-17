import {
  AbstractFulfillmentProviderService,
  MedusaError,
} from "@medusajs/framework/utils";
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CreateFulfillmentResult,
  CreateShippingOptionDTO,
  FulfillmentDTO,
  FulfillmentItemDTO,
  FulfillmentOption,
  FulfillmentOrderDTO,
  Logger,
  ValidateFulfillmentDataContext,
} from "@medusajs/framework/types";
import { z } from "@medusajs/framework/zod";
import { ALGERIAN_LOGISTICS_MODULE } from "../algerian-logistics";
import type AlgerianLogisticsModuleService from "../algerian-logistics/service";
import type { DeliveryMode } from "../algerian-logistics/service";

type InjectedDependencies = {
  logger: Logger;
  [ALGERIAN_LOGISTICS_MODULE]: AlgerianLogisticsModuleService;
};

const fulfillmentPayloadSchema = z.object({
  wilaya_code: z.coerce.number().int().min(1).max(69),
  commune_name_fr: z.string().trim().min(1).optional().nullable(),
  delivery_mode: z.enum(["home", "desk"]).optional(),
});

class AlgerianFulfillmentProviderService extends AbstractFulfillmentProviderService {
  static identifier = "algerian-fulfillment";

  protected logger_: Logger;
  protected logisticsService_: AlgerianLogisticsModuleService;

  constructor(container: InjectedDependencies) {
    super();
    this.logger_ = container.logger;
    this.logisticsService_ = container[ALGERIAN_LOGISTICS_MODULE];
  }

  /**
   * Options exposed in Medusa Admin when creating Shipping Options under a DZ Service Zone.
   */
  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [
      {
        id: "algerian-home-delivery",
        name: "Algeria Home Delivery (Domicile)",
        delivery_mode: "home",
      },
      {
        id: "algerian-stop-desk",
        name: "Algeria Stop-Desk Pickup (Point de retrait)",
        delivery_mode: "desk",
      },
    ];
  }

  async validateOption(data: Record<string, unknown>): Promise<boolean> {
    const mode = data?.delivery_mode;
    return mode === "home" || mode === "desk";
  }

  async canCalculate(_data: CreateShippingOptionDTO): Promise<boolean> {
    return true;
  }

  /**
   * Validates & locks customer-submitted Wilaya/Commune data onto the Cart ShippingMethod.
   */
  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: ValidateFulfillmentDataContext
  ): Promise<Record<string, unknown>> {
    const resolvedWilayaRaw =
      data?.wilaya_code ??
      (context.shipping_address?.metadata as Record<string, unknown> | undefined)
        ?.wilaya_code ??
      this.extractWilayaCodeFromProvince(context.shipping_address?.province);

    const parsed = fulfillmentPayloadSchema.safeParse({
      wilaya_code: resolvedWilayaRaw,
      commune_name_fr:
        data?.commune_name_fr ?? context.shipping_address?.city ?? null,
      delivery_mode: data?.delivery_mode ?? optionData?.delivery_mode,
    });

    if (!parsed.success) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A valid Algerian wilaya_code (1-69) is required to select this shipping method."
      );
    }

    const deliveryMode: DeliveryMode =
      parsed.data.delivery_mode ??
      (optionData?.delivery_mode === "desk" ? "desk" : "home");

    // Validates wilaya/commune is active on server and resolves courier fallback code
    const quote = await this.logisticsService_.resolveDeliveryQuote({
      wilaya_code: parsed.data.wilaya_code,
      commune_name_fr: parsed.data.commune_name_fr,
      delivery_mode: deliveryMode,
    });

    return {
      wilaya_code: quote.wilaya_code,
      carrier_wilaya_code: quote.carrier_wilaya_code,
      commune_name_fr: parsed.data.commune_name_fr ?? null,
      delivery_mode: quote.delivery_mode,
      quoted_amount: quote.amount,
      currency_code: quote.currency_code,
    };
  }

  /**
   * Authoritative server-side shipping price calculation for Medusa Cart & Order totals.
   */
  async calculatePrice(
    optionData: CalculateShippingOptionPriceDTO["optionData"],
    data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    const deliveryMode: DeliveryMode =
      data?.delivery_mode === "desk" || optionData?.delivery_mode === "desk"
        ? "desk"
        : "home";

    const rawWilaya =
      data?.wilaya_code ??
      (context.shipping_address?.metadata as Record<string, unknown> | undefined)
        ?.wilaya_code ??
      this.extractWilayaCodeFromProvince(context.shipping_address?.province);

    const wilayaCode = Number(rawWilaya);

    // Before address/wilaya selection (e.g., listing options on empty cart), return safe base preview
    if (!Number.isInteger(wilayaCode) || wilayaCode < 1 || wilayaCode > 69) {
      return {
        calculated_amount: deliveryMode === "desk" ? 400 : 700,
        is_calculated_price_tax_inclusive: true,
      };
    }

    const communeNameFr =
      typeof data?.commune_name_fr === "string"
        ? data.commune_name_fr
        : context.shipping_address?.city ?? null;

    const quote = await this.logisticsService_.resolveDeliveryQuote({
      wilaya_code: wilayaCode,
      commune_name_fr: communeNameFr,
      delivery_mode: deliveryMode,
    });

    return {
      calculated_amount: quote.amount,
      is_calculated_price_tax_inclusive: true,
    };
  }

  /**
   * Called when merchant fulfills an Order in Medusa Admin.
   * Preserves carrier_wilaya_code & delivery details for courier label integrations.
   */
  async createFulfillment(
    data: Record<string, unknown>,
    _items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    _order: Partial<FulfillmentOrderDTO> | undefined,
    _fulfillment: Partial<Omit<FulfillmentDTO, "provider_id" | "data" | "items">>
  ): Promise<CreateFulfillmentResult> {
    return {
      data: {
        ...data,
        dispatched_at: new Date().toISOString(),
      },
      labels: [],
    };
  }

  async cancelFulfillment(_data: Record<string, unknown>): Promise<void> {
    return;
  }

  async createReturnFulfillment(
    fulfillment: Record<string, unknown>
  ): Promise<CreateFulfillmentResult> {
    return {
      data: {
        ...fulfillment,
        is_return: true,
      },
      labels: [],
    };
  }

  private extractWilayaCodeFromProvince(province?: string | null): number | undefined {
    if (!province) return undefined;
    const match = province.trim().match(/^(\d{1,2})\b/);
    return match ? Number(match[1]) : undefined;
  }
}

export default AlgerianFulfillmentProviderService;