import { 
  createStep, 
  createWorkflow, 
  StepResponse, 
  WorkflowResponse 
} from "@medusajs/framework/workflows-sdk"
import { ALGERIAN_LOGISTICS_MODULE } from "../modules/algerian-logistics"
import AlgerianLogisticsModuleService from "../modules/algerian-logistics/service"

interface UpsertWilayaRateInput {
  wilaya_code: number
  desk_price: number
  home_price: number
  region_id: string
}

const upsertWilayaRateStep = createStep(
  "upsert-wilaya-rate",
  async (input: UpsertWilayaRateInput, { container }) => {
    const logisticsService: AlgerianLogisticsModuleService = container.resolve(
      ALGERIAN_LOGISTICS_MODULE
    )

    const existingRates = await logisticsService.listWilayaRates({ 
      wilaya_code: input.wilaya_code 
    })

    if (existingRates && existingRates.length > 0) {
      // Accessing array item [0] to extract correct ID
      const targetRecordId = existingRates[0].id
      const updatedRate = await logisticsService.updateWilayaRates({
        id: targetRecordId,
        desk_price: input.desk_price,
        home_price: input.home_price,
        region_id: input.region_id
      })
      
      // Step definitions MUST use StepResponse
      return new StepResponse({ wilaya_rate: updatedRate, status: 200 })
    }

    const newRate = await logisticsService.createWilayaRates(input)
    return new StepResponse({ wilaya_rate: newRate, status: 201 })
  }
)

const upsertWilayaRateWorkflow = createWorkflow(
  "upsert-wilaya-rate",
  (input: UpsertWilayaRateInput) => {
    const response = upsertWilayaRateStep(input)
    
    // Workflows MUST use WorkflowResponse
    return new WorkflowResponse(response)
  }
)

export default upsertWilayaRateWorkflow
