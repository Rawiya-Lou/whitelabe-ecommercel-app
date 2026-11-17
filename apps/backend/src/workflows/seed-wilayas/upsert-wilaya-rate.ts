import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ALGERIAN_LOGISTICS_MODULE } from "../../modules/algerian-logistics";
import type AlgerianLogisticsModuleService from "../../modules/algerian-logistics/service";
import {
  MOTHER_WILAYA_CODES,
  normalizeLocationKey,
} from "../../modules/algerian-logistics/constants";
import type { AdminWilayaRateUpsertType } from "../../api/admin/wilaya-rates/validators";

export type UpsertWilayaRateInput = AdminWilayaRateUpsertType;

export async function upsertWilayaRateStepHandler(
  input: UpsertWilayaRateInput,
  { container }: { container: MedusaContainer }
) {
  const logisticsService = container.resolve<AlgerianLogisticsModuleService>(
    ALGERIAN_LOGISTICS_MODULE
  );

  const { overrides, ...baseWilayaData } = input;

  const existingRates = await logisticsService.listWilayaRates({
    wilaya_code: baseWilayaData.wilaya_code,
  });

  let targetId: string;
  let status = 201;

  const payload = {
    ...baseWilayaData,
    mother_wilaya_code: MOTHER_WILAYA_CODES[baseWilayaData.wilaya_code] ?? null,
  };

  if (existingRates.length > 0) {
    status = 200;
    const updated = await logisticsService.updateWilayaRates({
      id: existingRates[0].id,
      ...payload,
    });
    targetId = updated.id;
  } else {
    const created = await logisticsService.createWilayaRates(payload);
    targetId = created.id;
  }

  if (overrides !== undefined) {
    const oldOverrides = await logisticsService.listCommuneOverrides({
      wilaya_rate_id: targetId,
    });

    if (oldOverrides.length > 0) {
      await logisticsService.deleteCommuneOverrides(
        oldOverrides.map((o) => o.id)
      );
    }

    if (overrides.length > 0) {
      await logisticsService.createCommuneOverrides(
        overrides.map((override) => ({
          commune_name_fr: override.commune_name_fr,
          commune_name_ar: override.commune_name_ar,
          commune_key: normalizeLocationKey(override.commune_name_fr),
          home_delivery_price: override.home_delivery_price,
          stop_desk_price: override.stop_desk_price,
          is_active: override.is_active,
          wilaya_rate_id: targetId,
        }))
      );
    }
  }

  const finalResult = await logisticsService.retrieveWilayaRate(targetId, {
    relations: ["overrides"],
  });

  return new StepResponse({ wilaya_rate: finalResult, status });
}

export const upsertWilayaRateStep = createStep(
  "upsert-wilaya-rate",
  upsertWilayaRateStepHandler
);

export const upsertWilayaRateWorkflow = createWorkflow(
  "upsert-wilaya-rate",
  (input: UpsertWilayaRateInput) => {
    const response = upsertWilayaRateStep(input);
    return new WorkflowResponse(response);
  }
);

export default upsertWilayaRateWorkflow;