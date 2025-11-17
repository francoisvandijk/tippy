// Utility functions for API endpoints
// Ledger Reference: §13 (POPIA & Security)

import { createHash } from 'crypto';

/**
 * Hash phone number (MSISDN) for POPIA compliance per Ledger §13
 * Uses SHA256 hash
 */
export function hashPhoneNumber(msisdn: string): string {
  // Normalize phone number (remove spaces, dashes, etc.)
  const normalized = msisdn.replace(/\D/g, '');
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Mask phone number for logging per Ledger §13.3
 * Format: xxxxxx1234 (last 4 digits visible)
 */
export function maskPhoneNumber(msisdn: string): string {
  const normalized = msisdn.replace(/\D/g, '');
  if (normalized.length <= 4) {
    return 'xxxx';
  }
  const lastFour = normalized.slice(-4);
  return 'xxxxxx' + lastFour;
}

/**
 * Generate a request ID for tracing
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}




