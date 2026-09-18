import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

export interface SystemDefaultsResult {
  salesChannelId: string | undefined;
  shippingProfileId: string | undefined;
  stockLocationId: string | undefined;
}

export const getSystemDefaultsStep = createStep(
  "get-system-defaults",
  async (_, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);

    const { data: salesChannels } = await query.graph({
      entity: "sales_channel",
      fields: ["id"],
    });
    const { data: shippingProfiles } = await query.graph({
      entity: "shipping_profile",
      fields: ["id"],
    });
    const { data: stockLocations } = await query.graph({
      entity: "stock_location",
      fields: ["id"],
    });

    return new StepResponse({
      salesChannelId: salesChannels?.[0]?.id,
      shippingProfileId: shippingProfiles?.[0]?.id,
      stockLocationId: stockLocations?.[0]?.id,
    } as SystemDefaultsResult) ;
  },
);
