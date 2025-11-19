// Fee calculation per Ledger §5
export interface FeeCalculation {
  processorFee: number;
  platformFee: number;
  vatOnPlatform: number;
  netAmount: number;
}

/**
 * Calculate payment fees per Ledger §5
 *
 * §5.1 Processor Fee: processor_fee = amount_gross * YOCO_FEE_PERCENT/100
 * §5.2 Platform Fee: platform_fee = amount_gross * PLATFORM_FEE_PERCENT/100
 * §5.3 VAT: vat_on_platform = platform_fee * VAT_RATE_PERCENT/100
 * §5.4 Net To Pool: net = gross - processor_fee - platform_fee - vat_on_platform
 */
export function calculateFees(
  amountGross: number, // ZAR cents
  yocoFeePercent: number = parseFloat(process.env.YOCO_FEE_PERCENT || '0.00'),
  platformFeePercent: number = parseFloat(process.env.PLATFORM_FEE_PERCENT || '10.00'),
  vatRatePercent: number = parseFloat(process.env.VAT_RATE_PERCENT || '15.00')
): FeeCalculation {
  // §5.1 Processor Fee
  const processorFee = Math.round((amountGross * yocoFeePercent) / 100);

  // §5.2 Platform Fee
  const platformFee = Math.round((amountGross * platformFeePercent) / 100);

  // §5.3 VAT on Platform Fee
  const vatOnPlatform = Math.round((platformFee * vatRatePercent) / 100);

  // §5.4 Net To Pool
  const netAmount = amountGross - processorFee - platformFee - vatOnPlatform;

  return {
    processorFee,
    platformFee,
    vatOnPlatform,
    netAmount: Math.max(0, netAmount), // Ensure non-negative
  };
}

/**
 * Generate payment reference number
 * Format: TPY-PAYOUT-YYYYMMDD-<id>
 * Per Ledger: Reference Prefix: TPY-
 */
export function generatePaymentReference(prefix: string = 'TPY'): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const randomId = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `${prefix}-PAYOUT-${dateStr}-${randomId}`;
}
