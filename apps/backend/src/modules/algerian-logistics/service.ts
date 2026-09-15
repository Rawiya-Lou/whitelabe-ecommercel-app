import { MedusaService } from "@medusajs/framework/utils"
import WilayaRate, { CommuneOverride }  from "./models/wilayaRate"

class AlgerianLogisticsModuleService extends MedusaService({
  WilayaRate,
  CommuneOverride,

}){
}

export default AlgerianLogisticsModuleService