import { describe, it, expect, vi } from "vitest";
import upsertWilayaRateWorkflow from "../upsert-wilaya-rate";
import { ALGERIAN_LOGISTICS_MODULE } from "../../../src/modules/algerian-logistics";

import { createContainer, asValue } from "awilix";
import type { MedusaContainer } from "@medusajs/framework/types";

describe("Upsert Wilaya Rate Workflow Execution Unit", () => {
  it("should run the internal execution logic correctly with mock resolving", async () => {
    const mockLogisticsService = {
      listWilayaRates: vi.fn().mockResolvedValue([]),
      createWilayaRates: vi
        .fn()
        .mockResolvedValue({ id: "wrate_abc", wilaya_code: 16 }),
      updateWilayaRates: vi.fn(),
    };
    const container = createContainer();

    container.register({
      [ALGERIAN_LOGISTICS_MODULE]: asValue(mockLogisticsService),
      AlgerianLogisticsModuleService: asValue(mockLogisticsService),
      logger: asValue({
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      }),
    });

    const { result } = await upsertWilayaRateWorkflow(
      container as unknown as MedusaContainer,
    ).run({
      input: {
        wilaya_code: 16,
        desk_price: 30000,
        home_price: 50000,
        region_id: "reg_1",
      },
    });

    expect(mockLogisticsService.listWilayaRates).toHaveBeenCalledWith({
      wilaya_code: 16,
    });
    expect(mockLogisticsService.createWilayaRates).toHaveBeenCalled();
    expect(result.status).toBe(201);
    expect(result.wilaya_rate.id).toBe("wrate_abc");
  });
});
