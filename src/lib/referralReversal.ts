// Referral reversal (T+30 chargeback) logic
// Ledger Reference: §10.2 (Milestone Logic), §10.3 (Eligibility & Payout)
//
// Implements T+30 reversal logic per Ledger §10.2:
// - Identifies referral rewards that are exactly T+30 days past the initial event
// - Checks required conditions for reversal
// - Generates reversal actions (REVERSAL ledger entries)

import { supabase } from './db';
import { logAuditEvent } from './audit';

export interface ReferralReversalConfig {
  enabled: boolean;
  reversalWindowDays: number; // Default: 30 days
  checkAbuseFlags: boolean; // Check abuse_flags table
  checkGuardActivity: boolean; // Check if guard is still active
  minGuardLifetimeGrossRetention: number; // Minimum % of lifetime gross that must remain (default: 80%)
}

export interface ReferralReversalProcessResult {
  config: ReferralReversalConfig;
  totalCandidates: number;
  reversalsProcessed: number;
  totalReversalAmountZarCents: number;
  reversals: ReferralReversalRecord[];
  errors: string[];
}

export interface ReferralReversalRecord {
  milestoneId: string;
  referrerId: string;
  referralId: string;
  guardId: string;
  originalEarnedId: string;
  reversalAmountZarCents: number;
  reversalReason: string;
  balanceAfterZarCents: number | null;
}

interface MilestoneCandidate {
  milestone_id: string;
  referrer_id: string;
  referral_id: string;
  guard_id: string;
  reward_amount_zar_cents: number;
  rewarded_at: string;
  created_at: string;
}

interface EarnedLedgerEntry {
  id: string;
  amount_zar_cents: number;
  created_at: string;
}

/**
 * Extract Ledger-governed referral reversal configuration from env.
 */
export function getReferralReversalConfig(): ReferralReversalConfig {
  const enabled = (process.env.REFERRAL_REVERSAL_ENABLED ?? 'true').toLowerCase() !== 'false';
  const reversalWindowDays = parseInt(process.env.REFERRAL_REVERSAL_WINDOW_DAYS || '30', 10);
  const checkAbuseFlags = (process.env.REFERRAL_REVERSAL_CHECK_ABUSE_FLAGS ?? 'true').toLowerCase() !== 'false';
  const checkGuardActivity = (process.env.REFERRAL_REVERSAL_CHECK_GUARD_ACTIVITY ?? 'true').toLowerCase() !== 'false';
  const minRetention = parseFloat(process.env.REFERRAL_REVERSAL_MIN_GUARD_RETENTION || '0.8'); // 80%

  return {
    enabled,
    reversalWindowDays,
    checkAbuseFlags,
    checkGuardActivity,
    minGuardLifetimeGrossRetention: minRetention,
  };
}

/**
 * Check if a milestone should be reversed based on configured conditions.
 */
async function shouldReverseMilestone(
  candidate: MilestoneCandidate,
  config: ReferralReversalConfig
): Promise<{ shouldReverse: boolean; reason: string }> {
  // Check abuse flags if enabled
  if (config.checkAbuseFlags) {
    const { data: abuseFlags, error: abuseError } = await supabase
      .from('abuse_flags')
      .select('id, flag_type, severity')
      .eq('guard_id', candidate.guard_id)
      .in('status', ['active', 'pending']);

    if (!abuseError && abuseFlags && abuseFlags.length > 0) {
      const highSeverityFlags = abuseFlags.filter((f) => f.severity === 'high' || f.severity === 'critical');
      if (highSeverityFlags.length > 0) {
        return {
          shouldReverse: true,
          reason: `Abuse flags detected: ${highSeverityFlags.map((f) => f.flag_type).join(', ')}`,
        };
      }
    }
  }

      // Check guard activity if enabled
      if (config.checkGuardActivity) {
        const { data: guard, error: guardError } = await supabase
          .from('guards')
          .select('id, status, lifetime_gross_tips')
          .eq('id', candidate.guard_id)
          .single();

        if (!guardError && guard) {
          // Check if guard is inactive
          if (guard.status !== 'active') {
            return {
              shouldReverse: true,
              reason: `Guard status is ${guard.status} (not active)`,
            };
          }

          // Check if guard's lifetime gross has decreased significantly (chargeback/refund indicator)
          // The milestone record already contains guard_lifetime_gross_at_milestone
          // We need to fetch it from the candidate or query it
          const { data: milestone } = await supabase
            .from('referral_milestones')
            .select('guard_lifetime_gross_at_milestone')
            .eq('id', candidate.milestone_id)
            .single();

          if (milestone && milestone.guard_lifetime_gross_at_milestone) {
            const milestoneGross = milestone.guard_lifetime_gross_at_milestone;
            const currentGross = guard.lifetime_gross_tips || 0;
            const retentionRatio = milestoneGross > 0 ? currentGross / milestoneGross : 1;

            if (retentionRatio < config.minGuardLifetimeGrossRetention) {
              return {
                shouldReverse: true,
                reason: `Guard lifetime gross decreased significantly: ${Math.round(retentionRatio * 100)}% retention (threshold: ${Math.round(config.minGuardLifetimeGrossRetention * 100)}%)`,
              };
            }
          }
        }
      }

  // Default: no reversal needed
  return {
    shouldReverse: false,
    reason: 'Conditions satisfied - no reversal required',
  };
}

/**
 * Process T+30 referral reversals by identifying eligible milestones and creating reversal entries.
 */
export async function processReferralReversals(): Promise<ReferralReversalProcessResult> {
  const config = getReferralReversalConfig();
  const summary: ReferralReversalProcessResult = {
    config,
    totalCandidates: 0,
    reversalsProcessed: 0,
    totalReversalAmountZarCents: 0,
    reversals: [],
    errors: [],
  };

  if (!config.enabled) {
    return summary;
  }

  // Calculate the cutoff date: milestones rewarded exactly T+30 days ago (or older)
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - config.reversalWindowDays * 24 * 60 * 60 * 1000);

  // Find milestones that:
  // 1. Are exactly T+30 days old (or older)
  // 2. Have status 'rewarded' (not yet reversed)
  // 3. Have a corresponding EARNED ledger entry
  const { data: milestoneCandidates, error: milestonesError } = await supabase
    .from('referral_milestones')
    .select(
      `
      id,
      referrer_id,
      referral_id,
      guard_id,
      reward_amount_zar_cents,
      rewarded_at,
      created_at,
      status
    `
    )
    .eq('status', 'rewarded')
    .lte('rewarded_at', cutoffDate.toISOString())
    .order('rewarded_at', { ascending: true });

  if (milestonesError) {
    summary.errors.push(`Failed to load milestone candidates: ${milestonesError.message}`);
    return summary;
  }

  if (!milestoneCandidates || milestoneCandidates.length === 0) {
    return summary;
  }

  summary.totalCandidates = milestoneCandidates.length;

  // For each candidate, check if reversal is needed and process it
  for (const row of milestoneCandidates) {
    const candidate: MilestoneCandidate = {
      milestone_id: row.id,
      referrer_id: row.referrer_id,
      referral_id: row.referral_id,
      guard_id: row.guard_id,
      reward_amount_zar_cents: row.reward_amount_zar_cents,
      rewarded_at: row.rewarded_at,
      created_at: row.created_at,
    };
    try {
      // Find the original EARNED ledger entry for this milestone
      const { data: earnedEntries, error: earnedError } = await supabase
        .from('referral_earnings_ledger')
        .select('id, amount_zar_cents, created_at')
        .eq('milestone_id', candidate.milestone_id)
        .eq('event_type', 'EARNED')
        .order('created_at', { ascending: false })
        .limit(1);

      if (earnedError || !earnedEntries || earnedEntries.length === 0) {
        summary.errors.push(
          `No EARNED ledger entry found for milestone ${candidate.milestone_id}`
        );
        continue;
      }

      const originalEarned = earnedEntries[0] as EarnedLedgerEntry;

      // Check if a reversal already exists for this earned entry
      const { data: existingReversal, error: reversalCheckError } = await supabase
        .from('referral_earnings_ledger')
        .select('id')
        .eq('reversal_reference_id', originalEarned.id)
        .eq('event_type', 'REVERSAL')
        .limit(1);

      if (reversalCheckError) {
        summary.errors.push(
          `Error checking for existing reversal: ${reversalCheckError.message}`
        );
        continue;
      }

      if (existingReversal && existingReversal.length > 0) {
        // Reversal already exists - skip (idempotency)
        continue;
      }

      // Check if reversal conditions are met
      const { shouldReverse, reason } = await shouldReverseMilestone(candidate, config);

      if (!shouldReverse) {
        // Conditions satisfied - no reversal needed
        continue;
      }

      // Calculate current balance after reversal
      const { data: currentBalanceData, error: balanceError } = await supabase
        .from('referral_earnings_ledger')
        .select('balance_after_zar_cents')
        .eq('referrer_id', candidate.referrer_id)
        .order('created_at', { ascending: false })
        .limit(1);

      let balanceAfter = 0;
      if (!balanceError && currentBalanceData && currentBalanceData.length > 0) {
        balanceAfter = (currentBalanceData[0] as { balance_after_zar_cents: number }).balance_after_zar_cents || 0;
      }

      // Calculate new balance after reversal
      balanceAfter = Math.max(0, balanceAfter - candidate.reward_amount_zar_cents);

      // Create reversal entry using RPC function
      const { data: reversalData, error: reversalError } = await supabase.rpc(
        'reverse_referral_milestone',
        {
          p_milestone_id: candidate.milestone_id,
          p_earned_ledger_id: originalEarned.id,
          p_reversal_reason: reason,
        }
      );

      if (reversalError) {
        summary.errors.push(
          `Failed to create reversal for milestone ${candidate.milestone_id}: ${reversalError.message}`
        );
        continue;
      }

      if (reversalData && Array.isArray(reversalData) && reversalData.length > 0) {
        const reversal = reversalData[0] as {
          reversal_id: string;
          balance_after_zar_cents: number;
        };

        const reversalRecord: ReferralReversalRecord = {
          milestoneId: candidate.milestone_id,
          referrerId: candidate.referrer_id,
          referralId: candidate.referral_id,
          guardId: candidate.guard_id,
          originalEarnedId: originalEarned.id,
          reversalAmountZarCents: candidate.reward_amount_zar_cents,
          reversalReason: reason,
          balanceAfterZarCents: reversal.balance_after_zar_cents,
        };

        summary.reversals.push(reversalRecord);
        summary.reversalsProcessed += 1;
        summary.totalReversalAmountZarCents += candidate.reward_amount_zar_cents;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      summary.errors.push(`Error processing milestone ${candidate.milestone_id}: ${errorMessage}`);
    }
  }

  return summary;
}

