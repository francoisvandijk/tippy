// Payment types per Ledger §4 and §5
export type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';

export interface Payment {
  id: string;
  reference_prefix: string;
  reference_number: string;
  yoco_charge_id?: string | null;
  yoco_payment_id?: string | null;
  guard_id: string;
  qr_code_id?: string | null;
  user_id?: string | null;
  amount_gross: number; // ZAR cents
  processor_fee: number; // ZAR cents
  platform_fee: number; // ZAR cents
  vat_on_platform: number; // ZAR cents
  amount_net: number; // ZAR cents
  status: PaymentStatus;
  yoco_status?: string | null;
  yoco_failure_reason?: string | null;
  card_last_four?: string | null;
  card_brand?: string | null;
  metadata?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
  updated_at: string;
  processed_at?: string | null;
  failed_at?: string | null;
  payout_batch_id?: string | null;
  audit_log?: Record<string, unknown> | null;
}

export interface CreatePaymentRequest {
  amount_gross: number; // ZAR cents
  guard_id: string;
  qr_code_id?: string;
  card_token?: string; // Yoco card token
  metadata?: Record<string, unknown>;
}

export interface PaymentResponse {
  id: string;
  reference_number: string;
  status: PaymentStatus;
  amount_gross: number;
  amount_net: number;
  created_at: string;
}

