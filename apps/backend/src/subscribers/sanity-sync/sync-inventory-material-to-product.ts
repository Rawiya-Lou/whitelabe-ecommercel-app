import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { MedusaError } from "@medusajs/framework/utils";
import { syncInventoryMaterialToProductWorkflow } from "../../workflows/sanity-sync/inventory-material-workflow";

interface InventoryItemEvent {
  id?: string;
  inventory_item_id?: string;
}

export default async function syncInventoryMaterialToProduct({
  event: { data },
  container,
}: SubscriberArgs<InventoryItemEvent>): Promise<void> {
  const inventoryItemId = data?.inventory_item_id || data?.id;
  if (!inventoryItemId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Inventory material synchronization requires an inventory item ID.",
    );
  }

  await syncInventoryMaterialToProductWorkflow(container).run({
    input: { inventoryItemId },
  });
}

export const config: SubscriberConfig = {
  event: ["inventory-item.created", "inventory-item.updated"],
};
