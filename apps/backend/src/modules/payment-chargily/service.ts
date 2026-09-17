// src/modules/payment-chargily/service.ts
import { AbstractPaymentProvider, MedusaError, BigNumber } from "@medusajs/framework/utils"
import { 
  InitiatePaymentInput, 
  InitiatePaymentOutput, 
  PaymentSessionStatus,
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  RetrievePaymentOutput,
  RetrievePaymentInput,
  CapturePaymentInput,
  CapturePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput
} from "@medusajs/framework/types"

interface ChargilyDataEvent {
  type?: string 
  data?: {
    id: string
    status: string
    amount: number
    currency: string
    metadata?: {
      cart_id?: string
      [key: string]: unknown
    }
  }
}

type ChargilyOptions = {
  secretKey: string
  successUrl: string
  failureUrl: string
  isTestMode?: boolean
}

type MedusaPaymentContext = {
  id?: string
  email?: string
  [key: string]: unknown
}

type ChargilyCheckoutResponse = {
  id: string
  entity: string
  livemode: boolean
  amount: number
  currency: string
  fees: number
  fees_on_merchant: number
  fees_on_customer: number
  pass_fees_to_customer: boolean | null
  chargily_pay_fees_allocation: string
  status: string
  locale: string
  description: string | null
  metadata: Record<string, unknown> | null
  success_url: string
  failure_url: string
  webhook_endpoint: string | null
  payment_method: string | null
  invoice_id: string | null
  customer_id: string | null
  payment_link_id: string | null
  created_at: number
  updated_at: number
  shipping_address: unknown | null
  collect_shipping_address: number
  discount: {
    type: string
    value: number
  } | null
  amount_without_discount: number
  checkout_url: string 
}

class ChargilyPaymentProvider extends AbstractPaymentProvider<ChargilyOptions> {
  static identifier = "chargily"
  protected options_: ChargilyOptions
  protected baseUrl: string

  constructor(container: Record<string, unknown>, options: ChargilyOptions) {
    super(container, options)
    this.options_ = options
    // SECURE: Points to the authentic Chargily REST endpoints for v2 API
    this.baseUrl = options.isTestMode 
      ? "https://pay.chargily.net/test" 
      : "https://pay.chargily.net"
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const { amount, currency_code, context } = input
    const typedContext = context as MedusaPaymentContext
    const cartId = typedContext?.id || "unknown_cart"

      if (currency_code.toLowerCase() !== "dzd") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Chargily Gateway strictly processes payments in Algerian Dinar (DZD)."
      )
    }

    try {
      const response = await fetch(`${this.baseUrl}/checkouts`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.options_.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amount, 
          currency: currency_code.toLowerCase() || "dzd",
          success_url: this.options_.successUrl,
          failure_url: this.options_.failureUrl,
          metadata: { cart_id: cartId }
        }),
      })

      if (!response.ok) {
        const errorDetails: unknown = await response.json()
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Gateway Refusal: ${JSON.stringify(errorDetails)}`
        )
      }
      const checkoutData = (await response.json()) as ChargilyCheckoutResponse

      return {
        id: checkoutData.id, 
        data: {
          checkout_url: checkoutData.checkout_url,
          status: checkoutData.status
        },
      }
    } catch (error: unknown) {
      if (error instanceof MedusaError) {
        throw error
      }
      const errorMessage = error instanceof Error ? error.message : "Unknown network error"
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Chargily Context Gateway Initiation Failed: ${errorMessage}`
      )
    }
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    return {
      status: "pending_authorization" as PaymentSessionStatus,
      data: input.data,
    }
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput>  {
    const status = input.data?.status as string
    
    if (status === "paid") {
      return { status: "authorized" as PaymentSessionStatus }
    }
    if (status === "failed" || status === "expired") {
      return { status: "error" as PaymentSessionStatus }
    }
    return { status: "pending_authorization" as PaymentSessionStatus }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    const externalId = input.data?.id as string | undefined

    if (!externalId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Missing unique Chargily Checkout transaction identifier."
      )
    }

    try {
      const response = await fetch(`${this.baseUrl}/checkouts/${externalId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.options_.secretKey}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const errorDetails: unknown = await response.json()
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Failed to retrieve data from Chargily: ${JSON.stringify(errorDetails)}`
        )
      }

      const checkoutData = (await response.json()) as ChargilyCheckoutResponse

      return {
        data: {
          ...checkoutData 
        }
      }
    } catch (error: unknown) {
      if (error instanceof MedusaError) {
        throw error
      }
      const errorMessage = error instanceof Error ? error.message : "Unknown network connection error"
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Chargily Gateway Synchronous Retrieval Aborted: ${errorMessage}`
      )
    }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const { amount, currency_code, data } = input

    try {
      if (!amount || !currency_code) {
        return { data: { ...data } }
      }

      return {
        data: {
          ...data,
          amount: amount,
          currency: currency_code.toLowerCase()
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown update failure"
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Chargily Gateway Synchronous Update Aborted: ${errorMessage}`
      )
    }
  }

  async getWebhookActionAndData(payload: {
    data: Record<string, unknown>
    rawData: string | Buffer
    headers: Record<string, unknown>
  }): Promise<WebhookActionResult> {
    const data = payload.data as unknown as ChargilyDataEvent

    try { 
      switch(data.type) {
        case "checkout.paid":
          return {
            action: "authorized",
            data: {
              session_id: data.data?.id || "",
              amount: new BigNumber(data.data?.amount ?? 0)
            }
          }
        default:
          return {
            action: "not_supported",
            data: {  
              session_id: "",
              amount: new BigNumber(0)
            }
          }
      }
    } catch (e) {
      return {
        action: "failed",
        data: {
          session_id: data.data?.id || "",
          amount: new BigNumber(data.data?.amount ?? 0)
        }
      }
    }
  }

 
  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> { 
    return {  data: {...input.data }}  
  }
  
  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> { 
    return {  data: {...input.data }} 
  }
  
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> { 
    return { data: {...input.data }} 
  }
  
  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> { 
    return {  data: {...input.data }}  
  }
}

export default ChargilyPaymentProvider
