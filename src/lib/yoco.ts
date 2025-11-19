// Yoco API integration
// Ledger Reference: §5 (Fees & Calculations), §6 (Key Workflows)

import crypto from 'crypto';

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
  private isTestMode: boolean;

  constructor() {
    // Determine if we're in test mode (dev/test environments use test keys)
    const nodeEnv = process.env.NODE_ENV || 'development';
    this.isTestMode = nodeEnv !== 'production';

    // Select keys based on environment
    if (this.isTestMode) {
      this.publicKey = process.env.YOCO_TEST_PUBLIC_KEY || '';
      this.secretKey = process.env.YOCO_TEST_SECRET_KEY || '';
    } else {
      this.publicKey = process.env.YOCO_LIVE_PUBLIC_KEY || '';
      this.secretKey = process.env.YOCO_LIVE_SECRET_KEY || '';
    }

    this.baseUrl = process.env.YOCO_API_URL || 'https://online.yoco.com/api/v1';

    if (!this.publicKey || !this.secretKey) {
      const keyType = this.isTestMode ? 'test' : 'live';
      throw new Error(
        `Yoco ${keyType} credentials not configured. Set YOCO_${keyType.toUpperCase()}_PUBLIC_KEY and YOCO_${keyType.toUpperCase()}_SECRET_KEY environment variables.`
      );
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
        Authorization: `Bearer ${this.secretKey}`,
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
      const err = (await response.json().catch(() => ({ message: 'Unknown error' }))) as {
        message?: string;
      };
      throw new Error(`Yoco API error: ${err.message ?? 'Unknown error'}`);
    }

    const responseData = (await response.json()) as YocoChargeResponse;
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
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }
}
