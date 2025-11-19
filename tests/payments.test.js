'use strict';
// Tests for payments API
// Ledger Reference: §5 (Fees & Calculations), §7 (API Surface)
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const fees_1 = require('../src/lib/fees');
(0, vitest_1.describe)('Fee Calculation (Ledger §5)', () => {
  (0, vitest_1.it)('should calculate processor fee correctly (§5.1)', () => {
    const fees = (0, fees_1.calculateFees)(10000, 2.5, 10, 15); // R100, 2.5% Yoco fee
    (0, vitest_1.expect)(fees.processorFee).toBe(250); // 10000 * 0.025 = 250 cents
  });
  (0, vitest_1.it)('should calculate platform fee correctly (§5.2)', () => {
    const fees = (0, fees_1.calculateFees)(10000, 0, 10, 15); // R100, 10% platform fee
    (0, vitest_1.expect)(fees.platformFee).toBe(1000); // 10000 * 0.10 = 1000 cents
  });
  (0, vitest_1.it)('should calculate VAT correctly (§5.3)', () => {
    const fees = (0, fees_1.calculateFees)(10000, 0, 10, 15); // R100, 10% platform, 15% VAT
    (0, vitest_1.expect)(fees.vatOnPlatform).toBe(150); // 1000 * 0.15 = 150 cents
  });
  (0, vitest_1.it)('should calculate net amount correctly (§5.4)', () => {
    const fees = (0, fees_1.calculateFees)(10000, 2.5, 10, 15);
    // gross - processor - platform - vat = net
    // 10000 - 250 - 1000 - 150 = 8600 cents
    (0, vitest_1.expect)(fees.netAmount).toBe(8600);
  });
  (0, vitest_1.it)('should handle zero fees', () => {
    const fees = (0, fees_1.calculateFees)(10000, 0, 0, 0);
    (0, vitest_1.expect)(fees.processorFee).toBe(0);
    (0, vitest_1.expect)(fees.platformFee).toBe(0);
    (0, vitest_1.expect)(fees.vatOnPlatform).toBe(0);
    (0, vitest_1.expect)(fees.netAmount).toBe(10000);
  });
  (0, vitest_1.it)('should ensure net amount is non-negative', () => {
    const fees = (0, fees_1.calculateFees)(100, 50, 50, 15); // High fees
    (0, vitest_1.expect)(fees.netAmount).toBeGreaterThanOrEqual(0);
  });
});
(0, vitest_1.describe)('Payment Reference Generation', () => {
  (0, vitest_1.it)('should generate reference with TPY prefix', () => {
    const ref = (0, fees_1.generatePaymentReference)('TPY');
    (0, vitest_1.expect)(ref).toMatch(/^TPY-PAYOUT-\d{8}-[A-Z0-9]+$/);
  });
  (0, vitest_1.it)('should generate unique references', () => {
    const ref1 = (0, fees_1.generatePaymentReference)();
    const ref2 = (0, fees_1.generatePaymentReference)();
    (0, vitest_1.expect)(ref1).not.toBe(ref2);
  });
});
//# sourceMappingURL=payments.test.js.map
