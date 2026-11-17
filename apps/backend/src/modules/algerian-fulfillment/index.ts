import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import AlgerianFulfillmentProviderService from "./service";

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [AlgerianFulfillmentProviderService],
});