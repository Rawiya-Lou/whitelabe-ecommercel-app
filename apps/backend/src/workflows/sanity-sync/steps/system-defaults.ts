import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Logger } from "@medusajs/framework/types";
import { SystemDefaultsDTO } from "../types";

export const getSystemDefaultsStep = createStep(
  "get-system-defaults",
  async (
    _input: void,
    { container },
  ): Promise<StepResponse<SystemDefaultsDTO>> => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const logger = container.resolve(
      ContainerRegistrationKeys.LOGGER,
    ) as Logger;

    logger.info(
      "[Sanity Sync] Fetching framework fallback records and system configurations.",
    );

    const [
      { data: salesChannels },
      { data: shippingProfiles },
      { data: stockLocations },
    ] = await Promise.all([
      query.graph({
        entity: "sales_channel",
        fields: ["id", "name"],
        filters: { name: ["Default Sales Channel"] },
      }),
      query.graph({
        entity: "shipping_profile",
        fields: ["id", "type"],
        filters: { type: ["default"] },
      }),
      query.graph({
        entity: "stock_location",
        fields: ["id", "name"],
      }),
    ]);

    const salesChannelId = salesChannels?.[0]?.id || "";
    const shippingProfileId = shippingProfiles?.[0]?.id || "";
    const stockLocationId = stockLocations?.[0]?.id || "";

    if (!salesChannelId || !shippingProfileId || !stockLocationId) {
      logger.warn(
        `[Sanity Sync] System configuration gaps detected -> SalesChannel: [${!!salesChannelId}], ShippingProfile: [${!!shippingProfileId}], StockLocation: [${!!stockLocationId}]`,
      );
    }

    return new StepResponse<SystemDefaultsDTO>({
      salesChannelId,
      shippingProfileId,
      stockLocationId,
    });
  },
);
