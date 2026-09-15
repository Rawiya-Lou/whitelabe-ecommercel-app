import AlgerianLogisticsModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const ALGERIAN_LOGISTICS_MODULE = "algerianLogisticsModuleService"

export default Module(ALGERIAN_LOGISTICS_MODULE, {
  service: AlgerianLogisticsModuleService,
})