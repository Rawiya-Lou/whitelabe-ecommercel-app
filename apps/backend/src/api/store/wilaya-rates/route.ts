import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ALGERIAN_LOGISTICS_MODULE } from "../../../modules/algerian-logistics";
import AlgerianLogisticsModuleService from "../../../modules/algerian-logistics/service";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/framework/types";

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const logisticsService: AlgerianLogisticsModuleService = req.scope.resolve(
    ALGERIAN_LOGISTICS_MODULE,
  );

  const { wilaya_code } = req.query;

  try {
    if (wilaya_code) {
      const codeInt = parseInt(wilaya_code as string, 10);

      if (isNaN(codeInt) || codeInt < 1 || codeInt > 69) {
        res
          .status(400)
          .json({
            message:
              "Validation Error: 'wilaya_code' parameter must be between 1 and 69.",
          });
        return;
      }

      const rates = await logisticsService.listWilayaRates({
        wilaya_code: codeInt,
      });

      if (!rates || rates.length === 0) {
        res
          .status(404)
          .json({ message: `Logistics records empty for Wilaya ${codeInt}.` });
        return;
      }

      res.status(200).json({ wilaya_rate: rates[0] });
      return;
    }

    // Default: Return the entire structured regional price registry array mapping
    const allRates = await logisticsService.listWilayaRates();
    res.status(200).json({ wilaya_rates: allRates });
  } catch (error) {
    const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
    const isErrorInstance = error instanceof Error;
    const errorMessage = isErrorInstance ? error.message : String(error);
    const cleanErrorObject = isErrorInstance ? error : new Error(errorMessage);

    logger.error(
      `Critical error inside Algerian custom module query loops: ${errorMessage}`,
      cleanErrorObject,
    );
    res.status(500).json({
      type: "internal_error",
      message: "An unexpected error occurred.",
    });
  }
}
