import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import crypto from "crypto";

interface ChargilyPayload {
  type: string;
  data: {
    id: string;
    status: string;
    amount: number;
    currency: string;
  };
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)


  const signature = req.headers["signature"] as string | undefined;

  const secretKey = process.env.CHARGILY_SECRET_KEY;

  if (!signature || !secretKey) {
    logger.warn("Unauthorized webhook attempt: Missing signature, or secret configuration parameters.")

    res
      .status(400)
      .send("Unauthorized: Verification configurations are absent.");
    return;
  }

  const rawBody = req.rawBody as string | Buffer | undefined;
  if (!rawBody) {
      logger.warn("Unauthorized webhook attempt: Missing body configuration parameters.")

    res
      .status(400)
      .send("Validation aborted: Request payload string is empty.");
    return;
  }

  // Execute Strict HMAC SHA-256 Cryptographic Signature Verification Check
      const stringBody = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")

  const computedSignature = crypto
    .createHmac("sha256", secretKey)
    .update(stringBody)
    .digest("hex");

   const signatureBuffer = Buffer.from(signature, "hex");
  const computedBuffer = Buffer.from(computedSignature, "hex");

  if (signatureBuffer.length !== computedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, computedBuffer)) {
    logger.error("CRYPTOGRAPHIC MITM ATTACK BLOCKED: Webhook signature validation mismatch.");
    res.status(401).send("Unauthorized: Fingerprint verification failed.");
    return;
  }

  

 
 


  try {
    const event = JSON.parse(stringBody) as ChargilyPayload;
    
  const webhookReceiverService = req.scope.resolve(
    "webhookReceiverService" as any,
  );
  await webhookReceiverService.processPaymentWebhook({
      provider: "chargily",
      payload: event,
      headers: req.headers,
    });


    switch (event.type) {
      case "checkout.paid":
        logger.info(
          `Payment Succeeded: Session [${event.data.id}] captured successfully.`,
        );
        break;
      case "checkout.failed":
        logger.warn(
          `Payment Failed: Session [${event.data.id}] was rejected or canceled.`,
        );
        break;
    }

    res.status(200).json({ received: true });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown processing error";
    logger.error("[CHARGILY WEBHOOK ROUTE EXCEPTION]:" + errorMessage);
    res.status(500).send(`Internal execution pipeline crash: ${errorMessage}`);
  }
}
