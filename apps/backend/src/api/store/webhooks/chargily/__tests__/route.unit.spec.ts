import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { POST } from "../route";

// Helper tool to construct professional mock response objects matching framework properties
const createMockResponse = () => {
  const res = {} as MedusaResponse;
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe("Chargily Webhook Route Controller API", () => {
  const mockSecretKey = "test_sk_mock_secret_key_value_string";

  // type-safe mock logger service stubs
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CHARGILY_SECRET_KEY = mockSecretKey;
  });

  it("should return 400 Bad Request if the signature header is absent", async () => {
    const req = {
      headers: {}, // No signature provided
      scope: {
        resolve: vi.fn().mockReturnValue(mockLogger),
      },
    } as unknown as MedusaRequest;

    const res = createMockResponse();

    await POST(req, res);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Missing signature"),
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      "Unauthorized: Verification configurations are absent.",
    );
  });

  it("should return 400 Bad Request if the request rawBody payload is missing", async () => {
    const req = {
      headers: { signature: "some-signature-string" },
      rawBody: undefined, // Missing body context
      scope: {
        resolve: vi.fn().mockReturnValue(mockLogger),
      },
    } as unknown as MedusaRequest;

    const res = createMockResponse();

    await POST(req, res);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Missing body configuration"),
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      "Validation aborted: Request payload string is empty.",
    );
  });

  it("should return 401 Unauthorized if the cryptographic signature mismatch or length variation happens", async () => {
    const mockPayload = { type: "checkout.paid", data: { id: "session_fake" } };
    const rawDataString = JSON.stringify(mockPayload);

    // Generate an invalid signature but ensure matching byte lengths to mimic a sophisticated attack vectors
    const forgedSignature = crypto
      .createHash("sha256")
      .update("malicious-tampering")
      .digest("hex");

    const req = {
      headers: { signature: forgedSignature },
      rawBody: Buffer.from(rawDataString),
      scope: {
        resolve: vi.fn().mockReturnValue(mockLogger),
      },
    } as unknown as MedusaRequest;

    const res = createMockResponse();

    await POST(req, res);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("CRYPTOGRAPHIC MITM ATTACK BLOCKED"),
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith(
      "Unauthorized: Fingerprint verification failed.",
    );
  });

  it("should return 200 OK and trigger webhook receiver routing upon valid signature hashes", async () => {
    const mockPayload = {
      type: "checkout.paid",
      data: { id: "checkout_session_99214", amount: 4500, currency: "dzd" },
    };
    const rawDataString = JSON.stringify(mockPayload);

    // Compute a mathematically perfect matching HMAC SHA-256 signature
    const validSignature = crypto
      .createHmac("sha256", mockSecretKey)
      .update(rawDataString)
      .digest("hex");

    const mockWebhookReceiverService = {
      processPaymentWebhook: vi.fn().mockResolvedValue(undefined),
    };

    const containerResolver = vi.fn().mockImplementation((key: string) => {
      if (key === "webhookReceiverService") return mockWebhookReceiverService;
      return mockLogger; // Fallback default to mock logger registration
    });

    const req = {
      headers: { signature: validSignature },
      rawBody: Buffer.from(rawDataString),
      scope: { resolve: containerResolver },
    } as unknown as MedusaRequest;

    const res = createMockResponse();

    await POST(req, res);

    expect(containerResolver).toHaveBeenCalledWith("webhookReceiverService");
    expect(
      mockWebhookReceiverService.processPaymentWebhook,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "chargily",
        payload: mockPayload,
      }),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("captured successfully"),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it("should process checkout.failed events and correctly push warning entries into internal logger matrices", async () => {
    const mockPayload = {
      type: "checkout.failed",
      data: { id: "checkout_session_failed_01", amount: 4500, currency: "dzd" },
    };
    const rawDataString = JSON.stringify(mockPayload);

    const validSignature = crypto
      .createHmac("sha256", mockSecretKey)
      .update(rawDataString)
      .digest("hex");

    const mockWebhookReceiverService = {
      processPaymentWebhook: vi.fn().mockResolvedValue(undefined),
    };

    const containerResolver = vi.fn().mockImplementation((key: string) => {
      if (key === "webhookReceiverService") return mockWebhookReceiverService;
      return mockLogger;
    });

    const req = {
      headers: { signature: validSignature },
      rawBody: rawDataString, // Test string format variant routing compatibility
      scope: { resolve: containerResolver },
    } as unknown as MedusaRequest;

    const res = createMockResponse();

    await POST(req, res);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("rejected or canceled"),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should handle processing disruptions type-safely and output a clean 500 error code log statement", async () => {
    const mockPayload = { type: "checkout.paid", data: { id: "sess_error" } };
    const rawDataString = JSON.stringify(mockPayload);

    const validSignature = crypto
      .createHmac("sha256", mockSecretKey)
      .update(rawDataString)
      .digest("hex");

    const mockWebhookReceiverService = {
      processPaymentWebhook: vi
        .fn()
        .mockRejectedValue(new Error("Neon DB Connection Outage Timeout")),
    };

    const containerResolver = vi.fn().mockImplementation((key: string) => {
      if (key === "webhookReceiverService") return mockWebhookReceiverService;
      return mockLogger;
    });

    const req = {
      headers: { signature: validSignature },
      rawBody: Buffer.from(rawDataString),
      scope: { resolve: containerResolver },
    } as unknown as MedusaRequest;

    const res = createMockResponse();

    await POST(req, res);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("[CHARGILY WEBHOOK ROUTE EXCEPTION]"),
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining("Neon DB Connection Outage Timeout"),
    );
  });
});
