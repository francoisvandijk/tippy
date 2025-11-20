// Referral milestone helpers
// Ledger Reference: §3 (Config), §4 (Data Model), §6.5 (Referrals), §9 (Payouts), §10 (Referrals Domain)

import { supabase } from './db';

const REFERRAL_THRESHOLD_DEFAULT_ZAR_CENTS = 50000; // R500
const REFERRAL_REWARD_DEFAULT_ZAR_CENTS = 2000; // R20

export interface ReferralMilestoneConfig {
  enabled: boolean;
  thresholdZarCents: number;
  rewardZarCents: number;
}

export interface ReferralMilestoneProcessResult {
  config: ReferralMilestoneConfig;
  totalCandidates: number;
  milestonesAwarded: number;
  totalRewardAmountZarCents: number;
  rewards: ReferralMilestoneAward[];
}

export interface ReferralMilestoneAward {
  milestoneId: string;
  referrerId: string;
  referralId: string;
  guardId: string;
  rewardAmountZarCents: number;
  balanceAfterZarCents: number | null;
}

interface RpcAwardResult {
  milestone_id: string;
  referrer_id: string;
  referral_id: string;
  guard_id: string;
  reward_amount_zar_cents: number;
  balance_after_zar_cents: number | null;
}

interface ReferralRow {
  id: string;
  referrer_id: string;
  referred_guard_id: string;
  status: string;
  milestone_reached_at: string | null;
  guards?: {
    id: string;
    lifetime_gross_tips: number;
  } | null;
}

interface ReferralCandidate {
  referralId: string;
  referrerId: string;
  guardId: string;
  guardLifetimeGrossTips: number;
  milestoneReachedAt: string | null;
}

export type ReferralCandidateInput = ReferralCandidate;

type MilestoneStatusMap = Map<string, string>;

/**
 * Convert ZAR string env var to cents. Supports integer or decimal strings.
 */
function parseZarToCents(value: string | undefined, defaultCents: number): number {
  if (!value) {
    return defaultCents;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return defaultCents;
  }

  const numericValue = Number(trimmed);
  if (Number.isNaN(numericValue)) {
    return defaultCents;
  }

  // Permit explicit cents (e.g. "50000") while defaulting to ZAR conversion.
  if (!trimmed.includes('.') && numericValue > 1000) {
    return Math.round(numericValue);
  }

  return Math.round(numericValue * 100);
}

/**
 * Extract Ledger-governed referral milestone configuration from env.
 */
export function getReferralMilestoneConfig(): ReferralMilestoneConfig {
  const enabled = (process.env.REFERRAL_ENABLED ?? 'true').toLowerCase() !== 'false';

  const thresholdEnv =
    process.env.REFERRAL_MILESTONE_THRESHOLD_ZAR ?? process.env.REFERRAL_TIP_THRESHOLD_ZAR;
  const rewardEnv =
    process.env.REFERRAL_MILESTONE_REWARD_ZAR ?? process.env.REFERRAL_FEE_PER_GUARD_ZAR;

  const thresholdZarCents = parseZarToCents(
    thresholdEnv,
    REFERRAL_THRESHOLD_DEFAULT_ZAR_CENTS
  );
  const rewardZarCents = parseZarToCents(rewardEnv, REFERRAL_REWARD_DEFAULT_ZAR_CENTS);

  return {
    enabled,
    thresholdZarCents,
    rewardZarCents,
  };
}

/**
 * Determine which referrals have newly crossed the milestone threshold.
 */
export function determineEligibleReferralMilestones(
  candidates: ReferralCandidate[],
  thresholdZarCents: number,
  milestoneStatuses: MilestoneStatusMap
): ReferralCandidate[] {
  return candidates.filter((candidate) => {
    if (candidate.guardLifetimeGrossTips < thresholdZarCents) {
      return false;
    }

    if (candidate.milestoneReachedAt) {
      return false;
    }

    const existingStatus = milestoneStatuses.get(candidate.referralId);
    return !existingStatus;
  });
}

/**
 * Process referral milestones by identifying eligible referrals and awarding rewards via RPC.
 */
export async function processReferralMilestones(): Promise<ReferralMilestoneProcessResult> {
  const config = getReferralMilestoneConfig();
  const summary: ReferralMilestoneProcessResult = {
    config,
    totalCandidates: 0,
    milestonesAwarded: 0,
    totalRewardAmountZarCents: 0,
    rewards: [],
  };

  if (!config.enabled) {
    return summary;
  }

  const { data: referralRows, error: referralsError } = await supabase
    .from('referrals')
    .select(
      `
        id,
        referrer_id,
        referred_guard_id,
        status,
        milestone_reached_at,
        guards!inner(
          id,
          lifetime_gross_tips
        )
      `
    )
    .in('status', ['pending', 'active'])
    .order('created_at', { ascending: true });

  if (referralsError) {
    throw new Error(
      `[referrals] Failed to load referral candidates for milestone processing: ${referralsError.message}`
    );
  }

  const referralData = ((referralRows || []) as unknown) as ReferralRow[];

  const candidates: ReferralCandidate[] = referralData
    .map((row) => {
      const guardId = row.referred_guard_id || row.guards?.id;
      const guardLifetimeGrossTips = row.guards?.lifetime_gross_tips ?? 0;

      if (!guardId) {
        return undefined;
      }

      return {
        referralId: row.id,
        referrerId: row.referrer_id,
        guardId,
        guardLifetimeGrossTips,
        milestoneReachedAt: row.milestone_reached_at,
      };
    })
    .filter((candidate): candidate is ReferralCandidate => Boolean(candidate));

  summary.totalCandidates = candidates.length;

  if (candidates.length === 0) {
    return summary;
  }

  const referralIds = candidates.map((candidate) => candidate.referralId);

  let milestoneStatuses: MilestoneStatusMap = new Map();
  if (referralIds.length > 0) {
    const { data: milestoneRows, error: milestonesError } = await supabase
      .from('referral_milestones')
      .select('referral_id, status')
      .in('referral_id', referralIds);

    if (milestonesError && milestonesError.code !== 'PGRST116') {
      throw new Error(
        `[referrals] Failed to load milestone statuses: ${milestonesError.message}`
      );
    }

    milestoneStatuses = new Map(
      (milestoneRows || []).map((row: { referral_id: string; status: string }) => [
        row.referral_id,
        row.status,
      ])
    );
  }

  const eligibleCandidates = determineEligibleReferralMilestones(
    candidates,
    config.thresholdZarCents,
    milestoneStatuses
  );

  if (eligibleCandidates.length === 0) {
    return summary;
  }

  for (const candidate of eligibleCandidates) {
    const { data, error } = await supabase.rpc('award_referral_milestone', {
      p_referral_id: candidate.referralId,
      p_referrer_id: candidate.referrerId,
      p_guard_id: candidate.guardId,
      p_guard_lifetime_gross: candidate.guardLifetimeGrossTips,
      p_milestone_amount_zar_cents: config.thresholdZarCents,
      p_reward_amount_zar_cents: config.rewardZarCents,
    });

    if (error) {
      throw new Error(
        `[referrals] Failed to award milestone reward for referral ${candidate.referralId}: ${error.message}`
      );
    }

    if (Array.isArray(data) && data.length > 0) {
      (data as RpcAwardResult[]).forEach((record) => {
        const rewardRecord: ReferralMilestoneAward = {
          milestoneId: record.milestone_id,
          referrerId: record.referrer_id,
          referralId: record.referral_id,
          guardId: record.guard_id,
          rewardAmountZarCents: record.reward_amount_zar_cents ?? config.rewardZarCents,
          balanceAfterZarCents: record.balance_after_zar_cents ?? null,
        };

        summary.rewards.push(rewardRecord);
        summary.milestonesAwarded += 1;
        summary.totalRewardAmountZarCents += rewardRecord.rewardAmountZarCents;
      });
    }
  }

  return summary;
}


