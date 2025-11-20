// Integration tests for admin referral reversal endpoint
// Ledger Reference: §7 (API Surface), §10.2 (Milestone Logic)

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

// Set Yoco test credentials to avoid initialization errors
process.env.YOCO_TEST_PUBLIC_KEY = 'pk_test_123';
process.env.YOCO_TEST_SECRET_KEY = 'sk_test_123';

import * as dbModule from '../../src/lib/db';
import app from '../../src/server';

// Get the mocked supabase for test-specific mocks
const mockSupabaseFrom = (dbModule.supabase as any).from;
const mockSupabaseRpc = (dbModule.supabase as any).rpc;

// Test JWT secret (for generating test tokens)
const TEST_JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
process.env.REFERRAL_REVERSAL_ENABLED = 'true';
process.env.REFERRAL_REVERSAL_WINDOW_DAYS = '30';

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
  });

  it('should require admin authentication', async () => {
    const response = await request(app).post('/admin/referral/reversal').send({});

    expect(response.status).toBe(401);
  });

  it('should require admin role', async () => {
    const guardToken = generateTestToken('guard-123', 'guard');
    const response = await request(app)
      .post('/admin/referral/reversal')
      .set('Authorization', `Bearer ${guardToken}`)
      .send({});

    expect(response.status).toBe(403);
  });

  it('should process T+30 reversals successfully', async () => {
    const adminToken = generateTestToken('admin-123', 'admin');
    const milestoneId = 'milestone-1';
    const referrerId = 'referrer-1';
    const referralId = 'referral-1';
    const guardId = 'guard-1';

    // Mock milestone candidates (T+30 days old)
    const mockMilestoneData = [
      {
        id: milestoneId,
        referrer_id: referrerId,
        referral_id: referralId,
        guard_id: guardId,
        reward_amount_zar_cents: 2000,
        rewarded_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        status: 'rewarded',
      },
    ];

    const mockEarnedData = [
      {
        id: 'earned-1',
        amount_zar_cents: 2000,
        created_at: new Date().toISOString(),
      },
    ];

    const mockAbuseFlags = [
      {
        id: 'flag-1',
        flag_type: 'suspicious_pattern',
        severity: 'high',
      },
    ];

    const mockGuardData = {
      id: guardId,
      status: 'active',
      lifetime_gross_tips: 50000,
    };

    const mockMilestoneDetail = {
      guard_lifetime_gross_at_milestone: 50000,
    };

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
              lte: vi.fn(() => ({
                order: vi.fn(() =>
                  Promise.resolve({
                    data: mockMilestoneData,
                    error: null,
                  })
                ),
              })),
            })),
          })),
        };
      }

      if (table === 'referral_earnings_ledger') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() =>
                    Promise.resolve({
                      data: mockEarnedData,
                      error: null,
                    })
                  ),
                })),
              })),
            })),
          })),
        };
      }

      if (table === 'abuse_flags') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() =>
                Promise.resolve({
                  data: mockAbuseFlags,
                  error: null,
                })
              ),
            })),
          })),
        };
      }

      if (table === 'guards') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: mockGuardData,
                  error: null,
                })
              ),
            })),
          })),
        };
      }

      // Default mock for other tables
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() =>
                Promise.resolve({
                  data: [],
                  error: null,
                })
              ),
            })),
          })),
        })),
      };
    });

    // Mock RPC call for reversal
    mockSupabaseRpc.mockResolvedValueOnce({
      data: [
        {
          reversal_id: 'reversal-1',
          balance_after_zar_cents: 0,
        },
      ],
      error: null,
    });

    const response = await request(app)
      .post('/admin/referral/reversal')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.summary.reversalsProcessed).toBe(1);
    expect(response.body.summary.totalReversalAmountZarCents).toBe(2000);
  });

  it('should handle no candidates gracefully', async () => {
    const adminToken = generateTestToken('admin-123', 'admin');

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
              lte: vi.fn(() => ({
                order: vi.fn(() =>
                  Promise.resolve({
                    data: [],
                    error: null,
                  })
                ),
              })),
            })),
          })),
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: null,
                error: null,
              })
            ),
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
    expect(response.body.summary.reversalsProcessed).toBe(0);
    expect(response.body.summary.totalCandidates).toBe(0);
  });

  it('should skip milestones that already have reversals (idempotency)', async () => {
    const adminToken = generateTestToken('admin-123', 'admin');

    const mockMilestoneData = [
      {
        id: 'milestone-1',
        referrer_id: 'referrer-1',
        referral_id: 'referral-1',
        guard_id: 'guard-1',
        reward_amount_zar_cents: 2000,
        rewarded_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        status: 'rewarded',
      },
    ];

    const mockEarnedData = [
      {
        id: 'earned-1',
        amount_zar_cents: 2000,
        created_at: new Date().toISOString(),
      },
    ];

    const mockExistingReversal = [
      {
        id: 'reversal-1', // Reversal already exists
      },
    ];

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
              lte: vi.fn(() => ({
                order: vi.fn(() =>
                  Promise.resolve({
                    data: mockMilestoneData,
                    error: null,
                  })
                ),
              })),
            })),
          })),
        };
      }

      if (table === 'referral_earnings_ledger') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() =>
                    Promise.resolve({
                      data: mockEarnedData,
                      error: null,
                    })
                  ),
                })),
              })),
            })),
          })),
        };
      }

      // Default mock for other tables (including reversal check)
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() =>
                Promise.resolve({
                  data: mockExistingReversal,
                  error: null,
                })
              ),
            })),
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
    expect(response.body.summary.reversalsProcessed).toBe(0); // Should skip due to existing reversal
    expect(response.body.summary.totalCandidates).toBe(1);
  });
});

