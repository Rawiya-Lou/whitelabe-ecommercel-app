import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
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
  const signature = req.headers["signature"] as string;

  const secretKey = process.env.CHARGILY_SECRET_KEY;

  if (!signature || !secretKey) {
    res
      .status(400)
      .send("Security validation aborted: Missing verification credentials.");
    return;
  }

  const rawBody = req.rawBody?.toString();
  if (!rawBody) {
    res
      .status(400)
      .send("Validation aborted: Request payload string is empty.");
    return;
  }

  // Execute Strict HMAC SHA-256 Cryptographic Signature Verification Check
  const computedSignature = crypto
    .createHmac("sha256", secretKey)
    .update(rawBody)
    .digest("hex");

  if (computedSignature !== signature) {
    console.error("CRYPTOGRAPHIC THREAT BLOCKED: Webhook signature mismatch.");
    res.status(401).send("Unauthorized: Fingerprint verification failed.");
    return;
  }

  const event = JSON.parse(rawBody) as ChargilyPayload;

  // Resolve Medusa v2's native Webhook Receiver Service
  const webhookReceiverService = req.scope.resolve(
    "webhookReceiverService" as any,
  );

  try {
    console.log(
      `[CHARGILY V2] Processing verified payload event: [${event.type}]`,
    );

    // 5. Route the payload straight through the official webhook receiver layer
    await webhookReceiverService.processPaymentWebhook({
      provider: "chargily",
      payload: event,
      headers: req.headers,
    });

    switch (event.type) {
      case "checkout.paid":
        console.log(
          `Payment Succeeded: Session [${event.data.id}] captured successfully.`,
        );
        break;
      case "checkout.failed":
        console.warn(
          `Payment Failed: Session [${event.data.id}] was rejected or canceled.`,
        );
        break;
    }

    res.status(200).json({ received: true });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown processing error";
    console.error("[CHARGILY WEBHOOK ROUTE EXCEPTION]:", errorMessage);
    res.status(500).send(`Internal execution pipeline crash: ${errorMessage}`);
  }
}
