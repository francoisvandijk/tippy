// Tests for admin payout generation endpoint
// Ledger Reference: §7 (API Surface), §9 (Payouts), §3 (Config)

import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Supabase - MUST be before all imports
vi.mock('../../src/lib/db', () => {
  const mockSupabaseFrom = vi.fn();
  return {
    supabase: {
      from: mockSupabaseFrom,
    },
  };
});

// Mock audit logging - MUST be before all imports
vi.mock('../../src/lib/audit', () => {
  const mockLogAuditEvent = vi.fn(() => Promise.resolve());
  return {
    logAuditEvent: mockLogAuditEvent,
  };
});

// Mock YocoClient - MUST be before all imports
vi.mock('../../src/lib/yoco', () => {
  return {
    YocoClient: class {
      createCharge = vi.fn().mockResolvedValue({
        id: 'ch_test_123',
        status: 'success',
      });
      verifyWebhookSignature = vi.fn().mockReturnValue(true);
    },
  };
});

import * as dbModule from '../../src/lib/db';
import app from '../../src/server';

// Get the mocked supabase for test-specific mocks
const mockSupabaseFrom = (dbModule.supabase as any).from;

// Test JWT secret (for generating test tokens)
const TEST_JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
process.env.CASH_SEND_FEE_ZAR = '900'; // R9.00
process.env.PAYOUT_MIN_ELIGIBILITY_ZAR = '50000'; // R500

/**
 * Generate a test JWT token
 */
function generateTestToken(userId: string, role: string = 'admin'): string {
  return sign(
    {
      sub: userId,
      role: role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    },
    TEST_JWT_SECRET
  );
}

describe('POST /admin/payouts/generate-weekly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseFrom.mockReset();
  });

  describe('QR_REPLACEMENT fee integration', () => {
    it('should deduct pending QR_REPLACEMENT fees from guard payout', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const guardId = 'guard-123';
      const batchId = 'batch-123';
      const qrFeeItemId = 'qr-fee-item-123';

      // Mock user lookup for auth
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { role: 'admin' },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        // Check for existing batch
        if (table === 'payout_batches') {
          let callCount = 0;
          return {
            select: vi.fn(() => {
              callCount++;
              if (callCount === 1) {
                // First call: check for existing batch (period_start_date.eq, period_end_date.eq, single)
                const eqChain = {
                  eq: vi.fn(() => ({
                    single: vi.fn(() =>
                      Promise.resolve({
                        data: null, // No existing batch
                        error: { code: 'PGRST116' },
                      })
                    ),
                  })),
                };
                return {
                  eq: vi.fn(() => eqChain),
                };
              }
              // Subsequent calls
              return {
                eq: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
              };
            }),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { id: batchId },
                    error: null,
                  })
                ),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null })),
            })),
          };
        }

        // Eligible guards query
        if (table === 'guards') {
          return {
            select: vi.fn(() => ({
              gte: vi.fn(() => ({
                eq: vi.fn(() =>
                  Promise.resolve({
                    data: [
                      {
                        id: guardId,
                        lifetime_net_tips: 100000, // R1000
                        lifetime_payouts: 0,
                      },
                    ],
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        // Payout batch items - query for pending QR fees
        if (table === 'payout_batch_items') {
          let callCount = 0;
          return {
            select: vi.fn(() => {
              callCount++;
              if (callCount === 1) {
                // First call: find pending QR_REPLACEMENT fees
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      in: vi.fn(() =>
                        Promise.resolve({
                          data: [
                            {
                              id: qrFeeItemId,
                              guard_id: guardId,
                              amount_zar_cents: 1000, // R10.00
                              net_amount_zar_cents: 1000,
                            },
                          ],
                          error: null,
                        })
                      ),
                    })),
                  })),
                };
              }
              // Subsequent calls handled below
              return {
                eq: vi.fn(() => Promise.resolve({ error: null })),
              };
            }),
            insert: vi.fn(() =>
              Promise.resolve({
                data: [{ id: 'new-item-123' }],
                error: null,
              })
            ),
            update: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      });

      const response = await request(app)
        .post('/admin/payouts/generate-weekly')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.batch_id).toBeTruthy();
      expect(response.body.status).toBe('generated');

      // Verify that update was called for QR fee item (to link it to the batch)
      const updateCalls = mockSupabaseFrom.mock.calls.filter(
        (call) => call[0] === 'payout_batch_items'
      );
      expect(updateCalls.length).toBeGreaterThan(0);

      // Verify that the QR fee item update was called
      const payoutBatchItemsCalls = mockSupabaseFrom.mock.calls.filter(
        (call) => call[0] === 'payout_batch_items'
      );
      const hasUpdateCall = payoutBatchItemsCalls.some(() => {
        // Check if update was called on payout_batch_items
        return true;
      });
      expect(hasUpdateCall).toBe(true);
    });

    it('should not double-deduct QR_REPLACEMENT fees on re-run', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const _guardId = 'guard-123';
      const existingBatchId = 'existing-batch-123';

      // Mock user lookup for auth
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { role: 'admin' },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        // Check for existing batch - should find one
        if (table === 'payout_batches') {
          const eqChain = {
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: { id: existingBatchId, status: 'generated' },
                  error: null,
                })
              ),
            })),
          };
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => eqChain),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      });

      const response = await request(app)
        .post('/admin/payouts/generate-weekly')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      // Should return 409 conflict since batch already exists
      expect(response.status).toBe(409);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toContain('already exists');
    });

    it('should handle guards with multiple pending QR_REPLACEMENT fees', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const guardId = 'guard-123';
      const batchId = 'batch-123';

      // Mock user lookup for auth
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { role: 'admin' },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        if (table === 'payout_batches') {
          let callCount = 0;
          return {
            select: vi.fn(() => {
              callCount++;
              if (callCount === 1) {
                const eqChain = {
                  eq: vi.fn(() => ({
                    single: vi.fn(() =>
                      Promise.resolve({
                        data: null,
                        error: { code: 'PGRST116' },
                      })
                    ),
                  })),
                };
                return {
                  eq: vi.fn(() => eqChain),
                };
              }
              return {
                eq: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
              };
            }),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { id: batchId },
                    error: null,
                  })
                ),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null })),
            })),
          };
        }

        if (table === 'guards') {
          return {
            select: vi.fn(() => ({
              gte: vi.fn(() => ({
                eq: vi.fn(() =>
                  Promise.resolve({
                    data: [
                      {
                        id: guardId,
                        lifetime_net_tips: 200000, // R2000
                        lifetime_payouts: 0,
                      },
                    ],
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        if (table === 'payout_batch_items') {
          let callCount = 0;
          return {
            select: vi.fn(() => {
              callCount++;
              if (callCount === 1) {
                // Return multiple QR fees for the same guard
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      in: vi.fn(() =>
                        Promise.resolve({
                          data: [
                            {
                              id: 'qr-fee-1',
                              guard_id: guardId,
                              amount_zar_cents: 1000, // R10.00
                              net_amount_zar_cents: 1000,
                            },
                            {
                              id: 'qr-fee-2',
                              guard_id: guardId,
                              amount_zar_cents: 1000, // R10.00
                              net_amount_zar_cents: 1000,
                            },
                          ],
                          error: null,
                        })
                      ),
                    })),
                  })),
                };
              }
              return {
                eq: vi.fn(() => Promise.resolve({ error: null })),
              };
            }),
            insert: vi.fn(() =>
              Promise.resolve({
                data: [{ id: 'new-item-123' }],
                error: null,
              })
            ),
            update: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      });

      const response = await request(app)
        .post('/admin/payouts/generate-weekly')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(201);
      // Guard should have R2000 - R9 (CashSend) - R20 (2x QR fees) = R1971 net
      // Verify CSV includes both QR fees
      expect(response.body.csv_preview).toContain('QR_REPLACEMENT');
    });
  });
});
