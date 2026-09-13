import { MedusaService } from "@medusajs/framework/utils"
import WilayaRate from "./models/wilayaRate";

class AlgerianLogisticsModuleService extends MedusaService({
  WilayaRate,
}){
}

export default AlgerianLogisticsModuleService