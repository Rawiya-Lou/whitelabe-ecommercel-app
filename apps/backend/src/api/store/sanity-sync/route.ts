import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { SanitySyncWorkflowInput } from "../../../workflows/sanity-sync/types";
import { sanitySyncProductWorkflow } from "../../../workflows/sanity-sync";

export async function POST(
  req: MedusaRequest<SanitySyncWorkflowInput>, 
  res: MedusaResponse
): Promise<void> {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  const authToken = req.headers["x-sanity-sync-token"] as string | undefined;

  if (!authToken || authToken !== process.env.SANITY_SYNC_SECRET_TOKEN) {
    logger.warn("Unauthorized Sanity CMS Sync Attempt Blocked.");
    res.status(401).send("Unauthorized");
    return;
  }

  await sanitySyncProductWorkflow(req.scope).run({
    input: req.body
  });

  res.status(200).json({ success: true, message: "Sync job dispatched successfully" });
}
