import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { MedusaError, BigNumber } from "@medusajs/framework/utils"
import { 
  InitiatePaymentInput, 
  GetPaymentStatusInput, 
  RetrievePaymentInput,
  UpdatePaymentInput,
  PaymentSessionStatus,
  AuthorizePaymentInput
} from "@medusajs/framework/types"
import ChargilyPaymentProvider, { MedusaPaymentContext } from "../service"


interface MockFetchResponse {
  ok: boolean
  json: () => Promise<unknown>
}



describe("ChargilyPaymentProvider", () => {
  let provider: ChargilyPaymentProvider
  const mockOptions = {
    secretKey: "test_secret_key",
    successUrl: "https://example.com/payments/success",
    failureUrl: "https://example.com/payments/failure",
    isTestMode: true,
  }

  // Structural mock data blueprint conforming perfectly to your implementation expectations
  const mockCheckoutResponse = {
    id: "01hj5n7cqpaf0mt2d0xx85tgz8",
    entity: "checkout",
    livemode: false,
    amount: 5000,
    currency: "dzd",
    fees: 50,
    fees_on_merchant: 50,
    fees_on_customer: 0,
    pass_fees_to_customer: null,
    chargily_pay_fees_allocation: "merchant",
    status: "pending",
    locale: "en",
    description: null,
    metadata: { cart_id: "01hj5n7cqpaf0mt2d0xx85tgz8" },
    success_url: "https://example.com/payments/success",
    failure_url: null,
    payment_method: null,
    invoice_id: null,
    customer_id: "01hj5n7cqpaf0mt2d0xxs3ddza",
    payment_link_id: null,
    created_at: 1690000000,
    updated_at: 1690000000,
    shipping_address: null,
    collect_shipping_address: 0,
    discount: null,
    amount_without_discount: 5000,
    checkout_url: "https://pay.chargily.dz/test/checkouts/01hj5n7cqpaf0mt2d0xx85tgz8/pay"
  }

  beforeEach(() => {
    provider = new ChargilyPaymentProvider({}, mockOptions)
    // Global fetch interceptor initialization
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("initiatePayment", () => {

    it("should successfully generate a Chargily checkout link for valid DZD currency context parameters", async () => {
      const mockFetch = vi.mocked(global.fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<unknown> => mockCheckoutResponse,
      } as MockFetchResponse as Response)

       const mockContext: MedusaPaymentContext = {
      id: mockCheckoutResponse.metadata.cart_id,
      email: "customer@domain.dz"
    }
    

      const input: InitiatePaymentInput = {
      amount: 5000,
      currency_code: "dzd",
      context: mockContext as InitiatePaymentInput["context"]
    }

      const result = await provider.initiatePayment(input)

      expect(mockFetch).toHaveBeenCalledWith(
        "https://pay.chargily.net/test/api/v2/checkouts",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Authorization": `Bearer ${mockOptions.secretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: 5000,
            currency: "dzd",
            success_url: mockOptions.successUrl,
            failure_url: mockOptions.failureUrl,
            metadata: { cart_id: "01hj5n7cqpaf0mt2d0xx85tgz8" },
          }),
        })
      )

      expect(result).toEqual({
        id: "01hj5n7cqpaf0mt2d0xx85tgz8",
        data: {
          checkout_url: "https://pay.chargily.dz/test/checkouts/01hj5n7cqpaf0mt2d0xx85tgz8/pay",
          status: "pending",
        },
      })
    })

    it("should reject gateway processing instantly if currency code context parameter is not set to DZD", async () => {
       const mockContext: MedusaPaymentContext = {
      id: mockCheckoutResponse.metadata.cart_id,
      email: "customer@domain.dz"
    }
    

      const input: InitiatePaymentInput = {
      amount: 5000,
      currency_code: "usd",
      context: mockContext as InitiatePaymentInput["context"]
    }

      await expect(provider.initiatePayment(input)).rejects.toThrow(
        expect.objectContaining({
          message: "Chargily Gateway strictly processes payments in Algerian Dinar (DZD).",
          type: "invalid_data"
        })
      )
    })

    it("should cleanly intercept explicit gateway error responses and wrap them into a Medusa invalid_data error", async () => {
      const mockFetch = vi.mocked(global.fetch)
      const mockApiErrorPayload = {
        message: "The success_url field is invalid.",
        errors: {
          success_url: ["The success url format is invalid."]
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: false, // Triggers !response.ok condition branch
        json: async (): Promise<unknown> => mockApiErrorPayload,
      } as Response)

      const mockContext: MedusaPaymentContext = {
        id: mockCheckoutResponse.metadata.cart_id,
        email: "customer@domain.dz"
      }
        const input: InitiatePaymentInput = {
        amount: 5000,
        currency_code: "dzd",
        context: mockContext as InitiatePaymentInput["context"]
      }

      await expect(provider.initiatePayment(input)).rejects.toThrowError(
        expect.objectContaining({
          message: `Gateway Refusal: ${JSON.stringify(mockApiErrorPayload)}`,
          type: "invalid_data"
        })
      )
    })

    it("should bubble up unhandled connection rejections gracefully as an unexpected_state Medusa error", async () => {
      const mockFetch = vi.mocked(global.fetch)
      
      // Simulates a low-level network layer socket failure / DNS resolution collapse
      mockFetch.mockRejectedValueOnce(new Error("fetch failed due to network disruption"))

      const mockContext: MedusaPaymentContext = {
        id: mockCheckoutResponse.metadata.cart_id,
        email: "customer@domain.dz"
      }

      const input: InitiatePaymentInput = {
        amount: 5000,
        currency_code: "dzd",
        context: mockContext as InitiatePaymentInput["context"]
      }
      await expect(provider.initiatePayment(input)).rejects.toThrow(
        expect.objectContaining({
          message: "Chargily Context Gateway Initiation Failed: fetch failed due to network disruption",
          type: "unexpected_state"
        })
      )
    })



    it("should transform connection issues or HTTP error statuses into valid Medusa errors", async () => {
      const mockFetch = vi.mocked(global.fetch)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async (): Promise<unknown> => ({ error: "Bad Request" }),
      } as MockFetchResponse as Response)

      const mockContext: MedusaPaymentContext = {
      id: mockCheckoutResponse.metadata.cart_id,
      email: "customer@domain.dz"
    }
    

      const input: InitiatePaymentInput = {
      amount: 5000,
      currency_code: "dzd",
      context: mockContext as InitiatePaymentInput["context"]
    }

      await expect(provider.initiatePayment(input)).rejects.toThrow(
       "Gateway Refusal: {\"error\":\"Bad Request\"}"
      )
    })

    it("should throw a MedusaError when Chargily API rejects the payload due to a missing failure URL", async () => {
      const mockFetch = vi.mocked(global.fetch)
      const mockErrorResponse = {
        errors: {
          failure_url: ["The failure url field is required when success url is present."]
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async (): Promise<unknown> => mockErrorResponse,
      } as MockFetchResponse as Response)

       const mockContext: MedusaPaymentContext = {
        id: mockCheckoutResponse.metadata.cart_id,
        email: "customer@domain.dz"
      }

       const input: InitiatePaymentInput = {
        amount: 5000,
        currency_code: "dzd",
        context: mockContext as InitiatePaymentInput["context"]
      }
 await expect(provider.initiatePayment(input)).rejects.toThrow(
        expect.objectContaining({
          message: `Gateway Refusal: ${JSON.stringify(mockErrorResponse)}`,
          type: "invalid_data"
        })
      )
    })
  })

    describe("authorizePayment", () => {
    it("should instantly return a pending_authorization state and mirror the session data payload", async () => {
      // Create structural mock data to represent a valid Medusa session record
      const mockSessionData = {
        id: mockCheckoutResponse.id,
        status: mockCheckoutResponse.status,
        checkout_url: mockCheckoutResponse.checkout_url
      }

      const input = {
        data: mockSessionData,
        context: {}
      }


      const result = await provider.authorizePayment(input as unknown as AuthorizePaymentInput)

      expect(result).toEqual({
        status: "pending_authorization" as PaymentSessionStatus,
        data: mockSessionData,
      })
    })
  })


  describe("getPaymentStatus", () => {
  
     it("should map a Chargily status of 'paid' to a Medusa status of 'authorized'", async () => {
      const input: GetPaymentStatusInput = {
        data: { status: "paid" },
      }

      const result = await provider.getPaymentStatus(input)
      expect(result).toEqual({ status: "authorized" as PaymentSessionStatus })
    })

     it("should map a Chargily status of 'failed' or 'expired' to a Medusa status of 'error'", async () => {
      const inputFailed: GetPaymentStatusInput = {
        data: { status: "failed" },
      }
      const inputExpired: GetPaymentStatusInput = {
        data: { status: "expired" },
      }

      const resultFailed = await provider.getPaymentStatus(inputFailed)
      const resultExpired = await provider.getPaymentStatus(inputExpired)

      expect(resultFailed).toEqual({ status: "error" as PaymentSessionStatus })
      expect(resultExpired).toEqual({ status: "error" as PaymentSessionStatus })
    })

     it("should default any unrecognized or pending Chargily status to a Medusa status of 'pending_authorization'", async () => {
      const inputPending: GetPaymentStatusInput = {
        data: { status: "pending" },
      }
      const inputMissing: GetPaymentStatusInput = {
        data: {}, // Simulates a completely absent status property layout
      }

      const resultPending = await provider.getPaymentStatus(inputPending)
      const resultMissing = await provider.getPaymentStatus(inputMissing)

      expect(resultPending).toEqual({ status: "pending_authorization" as PaymentSessionStatus })
      expect(resultMissing).toEqual({ status: "pending_authorization" as PaymentSessionStatus })
    })

    it("should output structural error session values when checkout falls into 'failed' or 'expired' flags", async () => {
      const inputFailed: GetPaymentStatusInput = { data: { status: "failed" } }
      const inputExpired: GetPaymentStatusInput = { data: { status: "expired" } }

      expect((await provider.getPaymentStatus(inputFailed)).status).toBe("error" as PaymentSessionStatus)
      expect((await provider.getPaymentStatus(inputExpired)).status).toBe("error" as PaymentSessionStatus)
    })

    it("should flag uncompleted states as pending authorization context blocks", async () => {
      const input: GetPaymentStatusInput = { data: { status: "pending" } }
      const result = await provider.getPaymentStatus(input)
      expect(result.status).toBe("pending_authorization" as PaymentSessionStatus)
    })
  })

  describe("retrievePayment", () => {
    it("should fetch checkout status metadata from Chargily synchronously using a unique identifier token", async () => {
      const mockFetch = vi.mocked(global.fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<unknown> => mockCheckoutResponse,
      } as MockFetchResponse as Response)

      const input: RetrievePaymentInput = {
        data: { id: "01hj5n7cqpaf0mt2d0xx85tgz8" },
      }

      const result = await provider.retrievePayment(input)

      expect(mockFetch).toHaveBeenCalledWith(
        "https://pay.chargily.net/test/api/v2/checkouts/01hj5n7cqpaf0mt2d0xx85tgz8",
        expect.objectContaining({ method: "GET" })
      )
      expect(result.data).toEqual(mockCheckoutResponse)
    })

    it("should abort synchronous operation parameters if unique transaction reference data is absent", async () => {
      const input: RetrievePaymentInput = { data: {} }
     await expect(provider.retrievePayment(input)).rejects.toThrow(
        expect.objectContaining({
          message: "Missing unique Chargily Checkout transaction identifier.",
          type: "invalid_data"
        })
    )
    })

      it("should transform explicit gateway response errors into valid invalid_data MedusaErrors", async () => {
      const mockFetch = vi.mocked(global.fetch)
      const mockApiError = {
        message: "The checkout session could not be found or has expired."
      }

      mockFetch.mockResolvedValueOnce({
        ok: false, // Triggers the !response.ok condition branch
        json: async (): Promise<unknown> => mockApiError,
      } as Response)

      const input: RetrievePaymentInput = {
        data: { id: "01hj5n7cqpaf0mt2d0xx85tgz8" }
      }
        await expect(provider.retrievePayment(input)).rejects.toThrowError(
        expect.objectContaining({
          message: `Failed to retrieve data from Chargily: ${JSON.stringify(mockApiError)}`,
          type: "invalid_data"
        })
      )
    })

     it("should catch unhandled runtime network exceptions and bubble them up as unexpected_state errors", async () => {
      const mockFetch = vi.mocked(global.fetch)
      
      // Simulates an abrupt socket disconnect or network infrastructure breakdown
      mockFetch.mockRejectedValueOnce(new Error("Connection refused by gateway firewall"))

      const input: RetrievePaymentInput = {
        data: { id: "01hj5n7cqpaf0mt2d0xx85tgz8" }
      }

      await expect(provider.retrievePayment(input)).rejects.toThrowError(
        expect.objectContaining({
          message: "Chargily Gateway Synchronous Retrieval Aborted: Connection refused by gateway firewall",
          type: "unexpected_state"
        })
    )
    })
    
  })

  describe("updatePayment", () => {
     const mockInitialData = 
     { id: "01hj5n7cqpaf0mt2d0xx85tgz8", status: "pending" }
      
     
    it("should process checkout modification details smoothly if new figures are specified", async () => {
      const input: UpdatePaymentInput = {
        amount: 8500,
        currency_code: "DZD",
        data: mockInitialData,
      }

      const result = await provider.updatePayment(input)
      expect(result.data).toEqual({
        id: "01hj5n7cqpaf0mt2d0xx85tgz8",
        status: "pending",
        amount: 8500,
        currency: "dzd",
      })
    })

     it("should return unchanged underlying data parameters if amount or currency code context is missing", async () => {
      const inputMissingAmount: UpdatePaymentInput = {
        currency_code: "DZD",
        amount: 0,
        data: mockInitialData,
      }
      const inputMissingCurrency = {
         currency_code: "",
        amount: 5000,
        data: mockInitialData,
      }

      const resultAmount = await provider.updatePayment(inputMissingAmount)
      const resultCurrency = await provider.updatePayment(inputMissingCurrency)

      expect(resultAmount.data).toEqual(mockInitialData)
      expect(resultCurrency.data).toEqual(mockInitialData)
    })

     it("should transform unhandled object mutations into an unexpected_state MedusaError", async () => {
      const input: UpdatePaymentInput = {
        amount: 8500,
        currency_code: { toLowerCase: () => { throw new Error("Prototype execution fault") } } as unknown as string,
        data: mockInitialData,
      }

      await expect(provider.updatePayment(input)).rejects.toThrowError(
        expect.objectContaining({
          message: "Chargily Gateway Synchronous Update Aborted: Prototype execution fault",
          type: "unexpected_state"
        })
      )
    })

    


  })

  describe("getWebhookActionAndData", () => {
    it("should interpret a webhook 'checkout.paid' notification format perfectly", async () => {
      const mockPayload = {
        data: {
          type: "checkout.paid",
          data: {
            id: "01hj5n7cqpaf0mt2d0xx85tgz8",
            status: "paid",
            amount: 7500,
            currency: "dzd",
          },
        },
        rawData: "",
        headers: {},
      }

      const result = await provider.getWebhookActionAndData(mockPayload)

      expect(result.action).toBe("authorized")
      expect(result.data?.session_id).toBe("01hj5n7cqpaf0mt2d0xx85tgz8")
      expect((result.data?.amount as BigNumber).numeric).toBe(7500)
    })

    it("should skip processing for unsupported webhook operations cleanly without crashing", async () => {
      const mockPayload = {
        data: {
          type: "checkout.expired",
          data: { id: "01hj5n7cqpaf0mt2d0xx85tgz8", status: "expired", amount: 0, currency: "dzd" },
        },
        rawData: "",
        headers: {},
      }

      const result = await provider.getWebhookActionAndData(mockPayload)
      expect(result.action).toBe("not_supported")
    })
    it("should catch unexpected structural exceptions gracefully and return a failed status action", async () => {
      const mockPayload = {
        data: {
          type: "checkout.paid",
          get data() {
            throw new Error("Critical database parsing error");


          }
         
        },
        rawData: "",
        headers: {}
      }
        const result = await provider.getWebhookActionAndData(mockPayload)

      expect(result.action).toBe("failed")
      expect(result.data?.session_id).toBe("")
    
      expect((result.data?.amount as BigNumber).numeric).toBe(0)
    })

  })
  describe("Passthrough Payment Operations", () => {
    const mockSessionData = {
      id: "01hj5n7cqpaf0mt2d0xx85tgz8",
      status: "paid",
    }
  
    it("should handle capturePayment by returning the input data cleanly", async () => {
      const result = await provider.capturePayment({
        data: mockSessionData,
      })
      expect(result.data).toEqual(mockSessionData)
    })
  
    it("should handle cancelPayment by returning the input data cleanly", async () => {
      const result = await provider.cancelPayment({
        data: mockSessionData,
      })
      expect(result.data).toEqual(mockSessionData)
    })
  
    it("should handle refundPayment by returning the input data cleanly", async () => {
      const result = await provider.refundPayment({
        data: mockSessionData,
        amount: 5000,
      })
      expect(result.data).toEqual(mockSessionData)
    })
  
    it("should handle deletePayment by returning the input data cleanly", async () => {
      const result = await provider.deletePayment({
        data: mockSessionData,
      })
      expect(result.data).toEqual(mockSessionData)
    })
  })
})


