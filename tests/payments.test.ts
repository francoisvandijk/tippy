// Tests for payments API
// Ledger Reference: §5 (Fees & Calculations), §7 (API Surface)

import { describe, it, expect } from 'vitest';

import { calculateFees, generatePaymentReference } from '../src/lib/fees';

describe('Fee Calculation (Ledger §5)', () => {
  it('should calculate processor fee correctly (§5.1)', () => {
    const fees = calculateFees(10000, 2.5, 10, 15); // R100, 2.5% Yoco fee
    expect(fees.processorFee).toBe(250); // 10000 * 0.025 = 250 cents
  });

  it('should calculate platform fee correctly (§5.2)', () => {
    const fees = calculateFees(10000, 0, 10, 15); // R100, 10% platform fee
    expect(fees.platformFee).toBe(1000); // 10000 * 0.10 = 1000 cents
  });

  it('should calculate VAT correctly (§5.3)', () => {
    const fees = calculateFees(10000, 0, 10, 15); // R100, 10% platform, 15% VAT
    expect(fees.vatOnPlatform).toBe(150); // 1000 * 0.15 = 150 cents
  });

  it('should calculate net amount correctly (§5.4)', () => {
    const fees = calculateFees(10000, 2.5, 10, 15);
    // gross - processor - platform - vat = net
    // 10000 - 250 - 1000 - 150 = 8600 cents
    expect(fees.netAmount).toBe(8600);
  });

  it('should handle zero fees', () => {
    const fees = calculateFees(10000, 0, 0, 0);
    expect(fees.processorFee).toBe(0);
    expect(fees.platformFee).toBe(0);
    expect(fees.vatOnPlatform).toBe(0);
    expect(fees.netAmount).toBe(10000);
  });

  it('should ensure net amount is non-negative', () => {
    const fees = calculateFees(100, 50, 50, 15); // High fees
    expect(fees.netAmount).toBeGreaterThanOrEqual(0);
  });
});

describe('Payment Reference Generation', () => {
  it('should generate reference with TPY prefix', () => {
    const ref = generatePaymentReference('TPY');
    expect(ref).toMatch(/^TPY-PAYOUT-\d{8}-[A-Z0-9]+$/);
  });

  it('should generate unique references', () => {
    const ref1 = generatePaymentReference();
    const ref2 = generatePaymentReference();
    expect(ref1).not.toBe(ref2);
  });
});

