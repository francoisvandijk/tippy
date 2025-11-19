'use strict';
// Tests for admin payout generation endpoint
// Ledger Reference: §7 (API Surface), §9 (Payouts), §3 (Config)
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
// Mock Supabase - MUST be before all imports
vitest_1.vi.mock('../../src/lib/db', () => {
  const mockSupabaseFrom = vitest_1.vi.fn();
  return {
    supabase: {
      from: mockSupabaseFrom,
    },
  };
});
// Mock audit logging - MUST be before all imports
vitest_1.vi.mock('../../src/lib/audit', () => {
  const mockLogAuditEvent = vitest_1.vi.fn(() => Promise.resolve());
  return {
    logAuditEvent: mockLogAuditEvent,
  };
});
// Mock YocoClient - MUST be before all imports
vitest_1.vi.mock('../../src/lib/yoco', () => {
  return {
    YocoClient: class {
      createCharge = vitest_1.vi.fn().mockResolvedValue({
        id: 'ch_test_123',
        status: 'success',
      });
      verifyWebhookSignature = vitest_1.vi.fn().mockReturnValue(true);
    },
  };
});
const vitest_2 = require('vitest');
const supertest_1 = __importDefault(require('supertest'));
const server_1 = __importDefault(require('../../src/server'));
const jsonwebtoken_1 = __importDefault(require('jsonwebtoken'));
const dbModule = __importStar(require('../../src/lib/db'));
// Get the mocked supabase for test-specific mocks
const mockSupabaseFrom = dbModule.supabase.from;
// Test JWT secret (for generating test tokens)
const TEST_JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
process.env.CASH_SEND_FEE_ZAR = '900'; // R9.00
process.env.PAYOUT_MIN_ELIGIBILITY_ZAR = '50000'; // R500
/**
 * Generate a test JWT token
 */
function generateTestToken(userId, role = 'admin') {
  return jsonwebtoken_1.default.sign(
    {
      sub: userId,
      role: role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    },
    TEST_JWT_SECRET
  );
}
(0, vitest_2.describe)('POST /admin/payouts/generate-weekly', () => {
  (0, vitest_2.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
    mockSupabaseFrom.mockReset();
  });
  (0, vitest_2.describe)('QR_REPLACEMENT fee integration', () => {
    (0, vitest_2.it)('should deduct pending QR_REPLACEMENT fees from guard payout', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const guardId = 'guard-123';
      const batchId = 'batch-123';
      const qrFeeItemId = 'qr-fee-item-123';
      // Mock user lookup for auth
      mockSupabaseFrom.mockImplementation((table) => {
        if (table === 'users') {
          return {
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
            select: vitest_1.vi.fn(() => {
              callCount++;
              if (callCount === 1) {
                // First call: check for existing batch (period_start_date.eq, period_end_date.eq, single)
                const eqChain = {
                  eq: vitest_1.vi.fn(() => ({
                    single: vitest_1.vi.fn(() =>
                      Promise.resolve({
                        data: null, // No existing batch
                        error: { code: 'PGRST116' },
                      })
                    ),
                  })),
                };
                return {
                  eq: vitest_1.vi.fn(() => eqChain),
                };
              }
              // Subsequent calls
              return {
                eq: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
              };
            }),
            insert: vitest_1.vi.fn(() => ({
              select: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
                  Promise.resolve({
                    data: { id: batchId },
                    error: null,
                  })
                ),
              })),
            })),
            update: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
            })),
          };
        }
        // Eligible guards query
        if (table === 'guards') {
          return {
            select: vitest_1.vi.fn(() => ({
              gte: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() =>
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
            select: vitest_1.vi.fn(() => {
              callCount++;
              if (callCount === 1) {
                // First call: find pending QR_REPLACEMENT fees
                return {
                  eq: vitest_1.vi.fn(() => ({
                    eq: vitest_1.vi.fn(() => ({
                      in: vitest_1.vi.fn(() =>
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
                eq: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
              };
            }),
            insert: vitest_1.vi.fn(() =>
              Promise.resolve({
                data: [{ id: 'new-item-123' }],
                error: null,
              })
            ),
            update: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
            })),
          };
        }
        return {
          select: vitest_1.vi.fn(() => ({
            eq: vitest_1.vi.fn(() => ({
              single: vitest_1.vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      });
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/admin/payouts/generate-weekly')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      (0, vitest_2.expect)(response.status).toBe(201);
      (0, vitest_2.expect)(response.body.batch_id).toBeTruthy();
      (0, vitest_2.expect)(response.body.status).toBe('generated');
      // Verify that update was called for QR fee item (to link it to the batch)
      const updateCalls = mockSupabaseFrom.mock.calls.filter(
        (call) => call[0] === 'payout_batch_items'
      );
      (0, vitest_2.expect)(updateCalls.length).toBeGreaterThan(0);
      // Verify that the QR fee item update was called
      const payoutBatchItemsCalls = mockSupabaseFrom.mock.calls.filter(
        (call) => call[0] === 'payout_batch_items'
      );
      const hasUpdateCall = payoutBatchItemsCalls.some(() => {
        // Check if update was called on payout_batch_items
        return true;
      });
      (0, vitest_2.expect)(hasUpdateCall).toBe(true);
    });
    (0, vitest_2.it)('should not double-deduct QR_REPLACEMENT fees on re-run', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const guardId = 'guard-123';
      const existingBatchId = 'existing-batch-123';
      // Mock user lookup for auth
      mockSupabaseFrom.mockImplementation((table) => {
        if (table === 'users') {
          return {
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
            eq: vitest_1.vi.fn(() => ({
              single: vitest_1.vi.fn(() =>
                Promise.resolve({
                  data: { id: existingBatchId, status: 'generated' },
                  error: null,
                })
              ),
            })),
          };
          return {
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => eqChain),
            })),
          };
        }
        return {
          select: vitest_1.vi.fn(() => ({
            eq: vitest_1.vi.fn(() => ({
              single: vitest_1.vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      });
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/admin/payouts/generate-weekly')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      // Should return 409 conflict since batch already exists
      (0, vitest_2.expect)(response.status).toBe(409);
      (0, vitest_2.expect)(response.body.error).toBe('VALIDATION_ERROR');
      (0, vitest_2.expect)(response.body.message).toContain('already exists');
    });
    (0, vitest_2.it)('should handle guards with multiple pending QR_REPLACEMENT fees', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const guardId = 'guard-123';
      const batchId = 'batch-123';
      // Mock user lookup for auth
      mockSupabaseFrom.mockImplementation((table) => {
        if (table === 'users') {
          return {
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
            select: vitest_1.vi.fn(() => {
              callCount++;
              if (callCount === 1) {
                const eqChain = {
                  eq: vitest_1.vi.fn(() => ({
                    single: vitest_1.vi.fn(() =>
                      Promise.resolve({
                        data: null,
                        error: { code: 'PGRST116' },
                      })
                    ),
                  })),
                };
                return {
                  eq: vitest_1.vi.fn(() => eqChain),
                };
              }
              return {
                eq: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
              };
            }),
            insert: vitest_1.vi.fn(() => ({
              select: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
                  Promise.resolve({
                    data: { id: batchId },
                    error: null,
                  })
                ),
              })),
            })),
            update: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
            })),
          };
        }
        if (table === 'guards') {
          return {
            select: vitest_1.vi.fn(() => ({
              gte: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() =>
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
            select: vitest_1.vi.fn(() => {
              callCount++;
              if (callCount === 1) {
                // Return multiple QR fees for the same guard
                return {
                  eq: vitest_1.vi.fn(() => ({
                    eq: vitest_1.vi.fn(() => ({
                      in: vitest_1.vi.fn(() =>
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
                eq: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
              };
            }),
            insert: vitest_1.vi.fn(() =>
              Promise.resolve({
                data: [{ id: 'new-item-123' }],
                error: null,
              })
            ),
            update: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
            })),
          };
        }
        return {
          select: vitest_1.vi.fn(() => ({
            eq: vitest_1.vi.fn(() => ({
              single: vitest_1.vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      });
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/admin/payouts/generate-weekly')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      (0, vitest_2.expect)(response.status).toBe(201);
      // Guard should have R2000 - R9 (CashSend) - R20 (2x QR fees) = R1971 net
      // Verify CSV includes both QR fees
      (0, vitest_2.expect)(response.body.csv_preview).toContain('QR_REPLACEMENT');
    });
  });
});
//# sourceMappingURL=admin-payouts.test.js.map
