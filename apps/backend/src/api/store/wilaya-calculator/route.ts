import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/framework/types";
import type { CalculateShippingInput } from "./validators";
import type { AdminWilayaRateUpsertType, AdminCommuneOverrideType } from "../../admin/wilaya-rates/validators";

type TypedWilayaRateModel =  AdminWilayaRateUpsertType
type TypedCommuneOverrideModel = AdminCommuneOverrideType

interface ExtendedWilayaRateGraphNode extends TypedWilayaRateModel {
  overrides?: TypedCommuneOverrideModel[];
}

interface QueryGraphResult {
  data: ExtendedWilayaRateGraphNode[];
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
 
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { wilaya_code, commune_name_fr, commune_name_ar, delivery_mode } = req.validatedBody as CalculateShippingInput;

  try {
  
    const { data: [rate] } = (await query.graph({
      entity: "wilaya_rate",
      fields: [
        "id",
        "wilaya_code",
        "wilaya_name_en",
        "wilaya_name_fr",
        "wilaya_name_ar",
        "home_price", 
        "desk_price", 
        "is_active", 
        "overrides.id",
        "overrides.commune_name_fr", 
        "overrides.commune_name_ar", 
        "overrides.home_delivery_price", 
        "overrides.stop_desk_price",
        "overrides.is_active"
      ],
      filters: { 
        wilaya_code, 
        is_active: true 
      }
    })) as unknown as QueryGraphResult;

  
    if (!rate) {
      res.status(404).json({ 
        message: `Fulfillment metrics for Wilaya code ${wilaya_code} are unavailable.` 
      });
      return;
    }

    const specificOverride = rate.overrides?.find(
      (override: TypedCommuneOverrideModel): boolean => 
        override.commune_name_fr.toLowerCase() === commune_name_fr.toLowerCase() && 
        override.is_active
    );

    let finalPrice: number;
    let isOverridden = false;

    if (specificOverride) {
      isOverridden = true;
      finalPrice = delivery_mode === "home"
        ? Number(specificOverride.home_delivery_price)
        : Number(specificOverride.stop_desk_price);
    } else {
      // Priority 2: Standard Fallback to baseline Wilaya core pricing values (home_price & desk_price)
      finalPrice = delivery_mode === "home"
        ? Number(rate.home_price)
        : Number(rate.desk_price);
    }

    // 5. Formulate localized enterprise REST Response
    res.status(200).json({
      wilaya_code,
      wilaya_names: {
        en: rate.wilaya_name_en,
        fr: rate.wilaya_name_fr,
        ar: rate.wilaya_name_ar
      },
      commune_name_fr,
      commune_name_ar,
      delivery_mode,
      shipping_cost: finalPrice,
      is_overridden: isOverridden,
      currency_code: "dzd"
    });

  } catch (error) {
    const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
    const isErrorInstance = error instanceof Error;
    const errorMessage = isErrorInstance ? error.message : String(error);
    const cleanErrorObject = isErrorInstance ? error : new Error(errorMessage);
    
    logger.error(`[WILAYA_CALCULATOR_API_CRASH]: ${errorMessage}`, cleanErrorObject);
    
    res.status(500).json({ 
      message: "An internal database query exception collapsed calculation sub-pipelines." 
    });
  }
}
