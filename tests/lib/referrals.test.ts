import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Supabase client before importing referral helpers
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

import {
  determineEligibleReferralMilestones,
  type ReferralCandidateInput,
} from '../../src/lib/referrals';

describe('determineEligibleReferralMilestones', () => {
  const thresholdZarCents = 50000; // R500
  const baseReferral: ReferralCandidateInput = {
    referralId: 'referral-abc',
    referrerId: 'referrer-xyz',
    guardId: 'guard-123',
    guardLifetimeGrossTips: 0,
    milestoneReachedAt: null,
  };

  let milestoneStatuses: Map<string, string>;

  beforeEach(() => {
    milestoneStatuses = new Map();
  });

  it('awards a single milestone when a guard crosses the R500 threshold over time', () => {
    // Week 1: R300 gross
    const week1 = determineEligibleReferralMilestones(
      [{ ...baseReferral, guardLifetimeGrossTips: 30000 }],
      thresholdZarCents,
      milestoneStatuses
    );
    expect(week1).toHaveLength(0);

    // Week 2: R480 gross (still below threshold)
    const week2 = determineEligibleReferralMilestones(
      [{ ...baseReferral, guardLifetimeGrossTips: 48000 }],
      thresholdZarCents,
      milestoneStatuses
    );
    expect(week2).toHaveLength(0);

    // Week 3: R510 gross (crosses threshold, should award once)
    const week3 = determineEligibleReferralMilestones(
      [{ ...baseReferral, guardLifetimeGrossTips: 51000 }],
      thresholdZarCents,
      milestoneStatuses
    );
    expect(week3).toHaveLength(1);
    expect(week3[0].referralId).toBe(baseReferral.referralId);

    // Mark milestone as rewarded to simulate DB state
    milestoneStatuses.set(baseReferral.referralId, 'rewarded');

    // Week 4: R700 gross (reward already issued; should skip)
    const week4 = determineEligibleReferralMilestones(
      [{ ...baseReferral, guardLifetimeGrossTips: 70000 }],
      thresholdZarCents,
      milestoneStatuses
    );
    expect(week4).toHaveLength(0);
  });

  it('awards milestone for guards that hit the threshold in a single payout', () => {
    const result = determineEligibleReferralMilestones(
      [{ ...baseReferral, guardLifetimeGrossTips: 65000 }],
      thresholdZarCents,
      milestoneStatuses
    );

    expect(result).toHaveLength(1);
    expect(result[0].guardLifetimeGrossTips).toBe(65000);
  });
});


