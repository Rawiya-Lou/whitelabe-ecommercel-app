import { 
  createStep, 
  createWorkflow, 
  StepResponse, 
  WorkflowResponse 
} from "@medusajs/framework/workflows-sdk"
import { ALGERIAN_LOGISTICS_MODULE } from "../../modules/algerian-logistics"
import AlgerianLogisticsModuleService from "../../modules/algerian-logistics/service"
import type { AdminWilayaRateUpsertType } from "../../api/admin/wilaya-rates/validators"

type UpsertWilayaRateInput = AdminWilayaRateUpsertType

export const upsertWilayaRateStep = createStep(
  "upsert-wilaya-rate",
  async (input: UpsertWilayaRateInput, { container }) => {
    const logisticsService: AlgerianLogisticsModuleService = container.resolve(
      ALGERIAN_LOGISTICS_MODULE
    )

    // Destructure to prevent payload contamination
    const { overrides, ...baseWilayaData } = input

    // Check if the rate config exists for this specific wilaya code
    const existingRates = await logisticsService.listWilayaRates({ 
      wilaya_code: baseWilayaData.wilaya_code 
    })

    let targetId: string
    let status = 201

    if (existingRates && existingRates.length > 0) {
      status = 200
      // Extract the object ID cleanly from the first matched array result
      const targetRecordId = existingRates[0].id
      
      // Medusa's update returns a singular object when given a singular input object
      const updatedRate = await logisticsService.updateWilayaRates({
        id: targetRecordId,
        ...baseWilayaData,
      })
      targetId = updatedRate.id
    } else {
      // Medusa's create returns a singular object when given a singular input object
      const newRate = await logisticsService.createWilayaRates(baseWilayaData)
      targetId = newRate.id
    }

    // Handle data relationships natively using the resolved parent ID
    if (overrides && overrides.length > 0) {
      // 1. Fetch any stale existing overrides to prepare for dynamic synchronization
      const oldOverrides = await logisticsService.listCommuneOverrides({
        wilaya_rate_id: targetId
      })

      if (oldOverrides.length > 0) {
        await logisticsService.deleteCommuneOverrides(oldOverrides.map(o => o.id))
      }

      // 2. Insert new typed sub-records explicitly mapped to the parent model
      await logisticsService.createCommuneOverrides(
        overrides.map((override) => ({
          commune_name_fr: override.commune_name_fr,
          home_delivery_price: override.home_delivery_price,
          stop_desk_price: override.stop_desk_price,
          is_active: override.is_active,
          wilaya_rate_id: targetId, // Linked explicitly through Medusa relation ID
        }))
      )
    }

    // Retrieve full object composite state using the singular utility method
    const finalResult = await logisticsService.retrieveWilayaRate(targetId, {
      relations: ["overrides"],
    })

    return new StepResponse({ wilaya_rate: finalResult, status })
  }
)

// Complete type-safe workflow pipeline mapping
export const upsertWilayaRateWorkflow = createWorkflow(
  "upsert-wilaya-rate",
  (input: UpsertWilayaRateInput) => {
    const response = upsertWilayaRateStep(input)
    
    return new WorkflowResponse(response)
  }
)

export default upsertWilayaRateWorkflow
