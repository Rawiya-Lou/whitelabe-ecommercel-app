import AlgerianLogisticsModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const ALGERIAN_LOGISTICS_MODULE = "wilaya_rate_module_service"

export default Module(ALGERIAN_LOGISTICS_MODULE, {
  service: AlgerianLogisticsModuleService,
})