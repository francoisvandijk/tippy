// Tests for admin referral reversal endpoint
// Ledger Reference: §7 (API Surface), §10.2 (T+30 reversal logic), §10.3 (Eligibility & Payout)

import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Supabase - MUST be before all imports
vi.mock('../../src/lib/db', () => {
  const mockSupabaseFrom = vi.fn();
  const mockSupabaseRpc = vi.fn();
  return {
    supabase: {
      from: mockSupabaseFrom,
      rpc: mockSupabaseRpc,
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

// Mock referral reversal processing - MUST be before all imports
vi.mock('../../src/lib/referralReversal', () => {
  const mockProcessReferralReversals = vi.fn(() =>
    Promise.resolve({
      config: { enabled: true, reversalWindowDays: 30 },
      totalCandidates: 0,
      reversalsProcessed: 0,
      totalReversalAmountZarCents: 0,
      reversals: [],
      errors: [],
    })
  );
  return {
    processReferralReversals: mockProcessReferralReversals,
  };
});

// Mock YocoClient - MUST be before all imports (server imports payments which uses YocoClient)
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
const mockSupabaseRpc = (dbModule.supabase as any).rpc;

// Test JWT secret (for generating test tokens)
const TEST_JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;

// Shared call counter for referral_earnings_ledger across multiple calls
let referralEarningsLedgerCallCount = 0;

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

describe('POST /admin/referral/reversal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseFrom.mockReset();
    mockSupabaseRpc.mockReset();
    referralEarningsLedgerCallCount = 0; // Reset shared counter
  });

  describe('Auth & Roles', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const response = await request(app).post('/admin/referral/reversal').send({});

      expect(response.status).toBe(401);
    });

    it('should return 403 for non-admin users', async () => {
      const guardToken = generateTestToken('guard-123', 'guard');
      const response = await request(app)
        .post('/admin/referral/reversal')
        .set('Authorization', `Bearer ${guardToken}`)
        .send({});

      expect(response.status).toBe(403);
    });

    it('should allow admin users', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');

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
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      });

      const response = await request(app)
        .post('/admin/referral/reversal')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      // Should process bulk reversals (no parameters)
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Manual Reversal', () => {
    it('should reverse a specific milestone when milestone_id and reason provided', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const milestoneId = 'milestone-123';
      const referralId = 'referral-123';
      const referrerId = 'referrer-123';
      const guardId = 'guard-123';
      const reason = 'Chargeback detected';

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

        if (table === 'referral_milestones') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: milestoneId,
                      referrer_id: referrerId,
                      referral_id: referralId,
                      guard_id: guardId,
                      reward_amount_zar_cents: 2000, // R20
                      status: 'rewarded',
                      rewarded_at: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
                    },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        if (table === 'referral_earnings_ledger') {
          return {
            select: vi.fn(() => {
              referralEarningsLedgerCallCount++;
              if (referralEarningsLedgerCallCount === 1) {
                // First call: find EARNED entry
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      limit: vi.fn(() =>
                        Promise.resolve({
                          data: [{ id: 'earned-123' }],
                          error: null,
                        })
                      ),
                    })),
                  })),
                };
              }
              // Second call: check for existing reversal
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    limit: vi.fn(() =>
                      Promise.resolve({
                        data: [], // No existing reversal
                        error: null,
                      })
                    ),
                  })),
                })),
              };
            }),
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

      // Mock RPC function for reversal
      mockSupabaseRpc.mockResolvedValueOnce({
        data: [
          {
            reversal_id: 'reversal-123',
            balance_after_zar_cents: 0,
          },
        ],
        error: null,
      });

      const response = await request(app)
        .post('/admin/referral/reversal')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          milestone_id: milestoneId,
          reason: reason,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.reversal_id).toBe('reversal-123');
      expect(response.body.milestone_id).toBe(milestoneId);
      expect(response.body.reason).toBe(reason);
      expect(mockSupabaseRpc).toHaveBeenCalledWith(
        'reverse_referral_milestone',
        expect.objectContaining({
          p_milestone_id: milestoneId,
          p_reversal_reason: reason,
        })
      );
    });

    it('should require reason for manual reversal', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');

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
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      });

      const response = await request(app)
        .post('/admin/referral/reversal')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          milestone_id: 'milestone-123',
          // Missing reason
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toContain('reason is required');
    });

    it('should return 404 if milestone not found', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');

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

        if (table === 'referral_milestones') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: null,
                    error: { code: 'PGRST116' },
                  })
                ),
              })),
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
        .post('/admin/referral/reversal')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          milestone_id: 'milestone-123',
          reason: 'Test reason',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('PROCESSOR_ERROR');
      expect(response.body.message).toContain('not found');
    });

    it('should return 409 if reversal already exists (idempotency)', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const milestoneId = 'milestone-123';

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

        if (table === 'referral_milestones') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: milestoneId,
                      referrer_id: 'referrer-123',
                      referral_id: 'referral-123',
                      guard_id: 'guard-123',
                      reward_amount_zar_cents: 2000,
                      status: 'rewarded',
                      rewarded_at: new Date().toISOString(),
                    },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        if (table === 'referral_earnings_ledger') {
          let callCount = 0;
          return {
            select: vi.fn(() => {
              callCount++;
              if (callCount === 1) {
                // First call: find EARNED entry
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      limit: vi.fn(() =>
                        Promise.resolve({
                          data: [{ id: 'earned-123' }],
                          error: null,
                        })
                      ),
                    })),
                  })),
                };
              }
              // Second call: check for existing reversal - exists!
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    limit: vi.fn(() =>
                      Promise.resolve({
                        data: [{ id: 'existing-reversal-123' }],
                        error: null,
                      })
                    ),
                  })),
                })),
              };
            }),
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
        .post('/admin/referral/reversal')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          milestone_id: milestoneId,
          reason: 'Test reason',
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toContain('already exists');
    });
  });

  describe('Bulk T+30 Processing', () => {
    it('should process bulk T+30 reversals when no parameters provided', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');

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
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      });

      const response = await request(app)
        .post('/admin/referral/reversal')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.summary).toBeDefined();
    });
  });
});
