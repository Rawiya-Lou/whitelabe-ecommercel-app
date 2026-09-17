import ChargilyPaymentProvider from "./service"
import { ModuleProviderExports } from "@medusajs/framework/types"

const services = [ChargilyPaymentProvider]

export default {
  services,
} as ModuleProviderExports
