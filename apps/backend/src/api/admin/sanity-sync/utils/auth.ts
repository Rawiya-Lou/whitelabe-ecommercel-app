import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const constantTimeEqual = (
  supplied: string,
  expected: string,
): boolean => {
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
};

export const createRequestFingerprint = (
  rawBodyString?: string,
): string | undefined => {
  if (!rawBodyString) return undefined;
  return createHash("sha256").update(rawBodyString).digest("hex");
};

export interface WebhookAuthResult {
  isValid: boolean;
  reason?: string;
}

export const verifyWebhookSignature = (params: {
  suppliedToken?: string;
  tokenSecret?: string;
  signature?: string;
  webhookSecret?: string;
  rawBodyString?: string;
}): WebhookAuthResult => {
  const {
    suppliedToken,
    tokenSecret,
    signature,
    webhookSecret,
    rawBodyString,
  } = params;

  if (!tokenSecret && !webhookSecret) {
    return { isValid: false, reason: "Webhook signing secret is not configured." };
  }

  if (!rawBodyString) {
    return { isValid: false, reason: "Raw request body is required." };
  }

  const isValidToken =
    Boolean(suppliedToken && tokenSecret) &&
    constantTimeEqual(suppliedToken || "", tokenSecret || "");

  let isValidSignature = false;
  if (signature && webhookSecret) {
    const suppliedSignature = signature.replace(/^sha256=/i, "");
    if (/^[\da-f]{64}$/i.test(suppliedSignature)) {
      const expectedSignature = createHmac("sha256", webhookSecret)
        .update(rawBodyString)
        .digest("hex");
      isValidSignature = constantTimeEqual(suppliedSignature, expectedSignature);
    }
  }

  if (!isValidToken && !isValidSignature) {
    return { isValid: false, reason: "Invalid signature or authorization token." };
  }

  return { isValid: true };
};