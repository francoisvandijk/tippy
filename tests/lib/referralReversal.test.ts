// Unit tests for referral reversal (T+30 chargeback) logic
// Ledger Reference: §10.2 (Milestone Logic)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getReferralReversalConfig, processReferralReversals } from '../../src/lib/referralReversal';
import { supabase } from '../../src/lib/db';

// Mock Supabase client
vi.mock('../../src/lib/db', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

// Mock audit logging
vi.mock('../../src/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

describe('getReferralReversalConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env vars
    delete process.env.REFERRAL_REVERSAL_ENABLED;
    delete process.env.REFERRAL_REVERSAL_WINDOW_DAYS;
    delete process.env.REFERRAL_REVERSAL_CHECK_ABUSE_FLAGS;
    delete process.env.REFERRAL_REVERSAL_CHECK_GUARD_ACTIVITY;
    delete process.env.REFERRAL_REVERSAL_MIN_GUARD_RETENTION;
  });

  it('should return default config when env vars are not set', () => {
    const config = getReferralReversalConfig();
    expect(config.enabled).toBe(true);
    expect(config.reversalWindowDays).toBe(30);
    expect(config.checkAbuseFlags).toBe(true);
    expect(config.checkGuardActivity).toBe(true);
    expect(config.minGuardLifetimeGrossRetention).toBe(0.8);
  });

  it('should parse env vars correctly', () => {
    process.env.REFERRAL_REVERSAL_ENABLED = 'false';
    process.env.REFERRAL_REVERSAL_WINDOW_DAYS = '45';
    process.env.REFERRAL_REVERSAL_CHECK_ABUSE_FLAGS = 'false';
    process.env.REFERRAL_REVERSAL_CHECK_GUARD_ACTIVITY = 'false';
    process.env.REFERRAL_REVERSAL_MIN_GUARD_RETENTION = '0.9';

    const config = getReferralReversalConfig();
    expect(config.enabled).toBe(false);
    expect(config.reversalWindowDays).toBe(45);
    expect(config.checkAbuseFlags).toBe(false);
    expect(config.checkGuardActivity).toBe(false);
    expect(config.minGuardLifetimeGrossRetention).toBe(0.9);
  });
});

describe('processReferralReversals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty summary when disabled', async () => {
    process.env.REFERRAL_REVERSAL_ENABLED = 'false';
    const result = await processReferralReversals();
    expect(result.reversalsProcessed).toBe(0);
    expect(result.totalCandidates).toBe(0);
  });

  it('should return empty summary when no candidates found', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          lte: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    });

    (supabase.from as any) = mockFrom;

    const result = await processReferralReversals();
    expect(result.reversalsProcessed).toBe(0);
    expect(result.totalCandidates).toBe(0);
  });

  it('should skip milestones that already have reversals (idempotency)', async () => {
    // Reset env to ensure enabled
    process.env.REFERRAL_REVERSAL_ENABLED = 'true';
    vi.clearAllMocks();
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

    const mockReversalCheckData = [
      {
        id: 'reversal-1', // Reversal already exists
      },
    ];

    let earnedCallCount = 0;
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'referral_milestones') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockMilestoneData, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'referral_earnings_ledger') {
        earnedCallCount++;
        // First call: find earned entry
        if (earnedCallCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: mockEarnedData, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        // Second call: check for existing reversal
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: mockReversalCheckData, error: null }),
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      };
    });

    (supabase.from as any) = mockFrom;

    const result = await processReferralReversals();
    expect(result.reversalsProcessed).toBe(0); // Should skip due to existing reversal
    expect(result.totalCandidates).toBe(1);
  });

  it('should process reversal when conditions are met', async () => {
    // Reset env to ensure enabled
    process.env.REFERRAL_REVERSAL_ENABLED = 'true';
    process.env.REFERRAL_REVERSAL_CHECK_ABUSE_FLAGS = 'true';
    process.env.REFERRAL_REVERSAL_CHECK_GUARD_ACTIVITY = 'true';
    vi.clearAllMocks();
    
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

    const mockAbuseFlags = [
      {
        id: 'flag-1',
        flag_type: 'suspicious_pattern',
        severity: 'high',
      },
    ];

    let ledgerCallCount = 0;
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'referral_milestones') {
        // Use column name to distinguish between first call (status) and subsequent calls (id)
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string) => {
              if (column === 'status') {
                // First call: find candidates
                return {
                  lte: vi.fn(() => ({
                    order: vi.fn(() =>
                      Promise.resolve({
                        data: mockMilestoneData,
                        error: null,
                      })
                    ),
                  })),
                };
              } else {
                // Subsequent calls: get milestone detail (for guard lifetime gross check)
                // Note: This won't be called if abuse flags are found first
                return {
                  single: vi.fn(() =>
                    Promise.resolve({
                      data: { guard_lifetime_gross_at_milestone: 50000 },
                      error: null,
                    })
                  ),
                };
              }
            }),
          })),
        };
      }
      if (table === 'referral_earnings_ledger') {
        ledgerCallCount++;
        // First call: find earned entry
        if (ledgerCallCount === 1) {
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
        // Second call: check for existing reversal
        if (ledgerCallCount === 2) {
          return {
            select: vi.fn(() => ({
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
            })),
          };
        }
        // Third call: get current balance
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() =>
                  Promise.resolve({
                    data: [{ balance_after_zar_cents: 2000 }],
                    error: null,
                  })
                ),
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
                  data: {
                    id: 'guard-1',
                    status: 'active',
                    lifetime_gross_tips: 50000,
                  },
                  error: null,
                })
              ),
            })),
          })),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      };
    });

    const mockRpc = vi.fn().mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            reversal_id: 'reversal-1',
            balance_after_zar_cents: 0,
          },
        ],
        error: null,
      })
    );

    (supabase.from as any) = mockFrom;
    (supabase.rpc as any) = mockRpc;

    const result = await processReferralReversals();
    expect(result.reversalsProcessed).toBe(1);
    expect(result.totalReversalAmountZarCents).toBe(2000);
    expect(result.reversals.length).toBe(1);
    expect(result.reversals[0].reversalReason).toContain('Abuse flags detected');
  });
});

