import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { SystemDefaultsDTO } from "../types";

export const getSystemDefaultsStep = createStep(
  "get-system-defaults",
  async (
    _input: void,
    { container },
  ): Promise<StepResponse<SystemDefaultsDTO>> => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);

    const [
      { data: salesChannels },
      { data: shippingProfiles },
      { data: stockLocations },
    ] = await Promise.all([
      query.graph({
        entity: "sales_channel",
        fields: ["id"],
        filters: { name: ["Default Sales Channel"] },
      }),
      query.graph({
        entity: "shipping_profile",
        fields: ["id"],
        filters: { type: ["default"] },
      }),

      query.graph({ entity: "stock_location", fields: ["id"] }),
    ]);

    return new StepResponse({
      salesChannelId: salesChannels[0]?.id || "",
      shippingProfileId: shippingProfiles[0]?.id || "",
      stockLocationId: stockLocations[0]?.id || "",
    });
  },
);
