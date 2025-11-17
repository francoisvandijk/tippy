// Yoco API integration
// Ledger Reference: §5 (Fees & Calculations), §6 (Key Workflows)

export interface YocoChargeRequest {
  amount: number; // Amount in cents
  currency: string;
  token: string; // Card token from Yoco.js
  reference?: string;
  metadata?: Record<string, unknown>;
}

export interface YocoChargeResponse {
  id: string;
  status: string;
  amount: number;
  currency: string;
  paymentType: string;
  cardNumber?: string;
  cardExpiryMonth?: number;
  cardExpiryYear?: number;
  cardBin?: string;
  cardLast4?: string;
  cardBrand?: string;
  failureReason?: string;
  createdAt: string;
}

export interface YocoWebhookEvent {
  id: string;
  type: string;
  data: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    reference?: string;
    failureReason?: string;
    createdAt: string;
  };
}

export class YocoClient {
  private publicKey: string;
  private secretKey: string;
  private baseUrl: string;

  constructor() {
    this.publicKey = process.env.YOCO_PUBLIC_KEY || '';
    this.secretKey = process.env.YOCO_SECRET_KEY || '';
    this.baseUrl = process.env.YOCO_API_URL || 'https://online.yoco.com/api/v1';
    
    if (!this.publicKey || !this.secretKey) {
      throw new Error('Yoco credentials not configured. Set YOCO_PUBLIC_KEY and YOCO_SECRET_KEY environment variables.');
    }
  }

  /**
   * Create a charge using Yoco API
   * Per Ledger §6.1: User Tipping (Yoco)
   */
  async createCharge(request: YocoChargeRequest): Promise<YocoChargeResponse> {
    const url = `${this.baseUrl}/charges`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.secretKey}`,
      },
      body: JSON.stringify({
        amount: request.amount,
        currency: request.currency || 'ZAR',
        token: request.token,
        reference: request.reference,
        metadata: request.metadata,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
      throw new Error(`Yoco API error: ${err.message ?? 'Unknown error'}`);
    }

    const responseData = await response.json() as YocoChargeResponse;
    return responseData;
  }

  /**
   * Verify webhook signature
   * Per Ledger §25: Secrets management
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const webhookSecret = process.env.YOCO_WEBHOOK_SECRET;
    if (!webhookSecret) {
      // If no webhook secret is configured, skip verification (not recommended for production)
      return true;
    }

    // Yoco webhook signature verification
    // Implementation depends on Yoco's specific signing method
    // This is a placeholder - adjust based on Yoco's actual webhook signing documentation
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}

