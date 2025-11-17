// Audit logging utility
// Ledger Reference: §4 (Data Model), §25 (Secrets Management)

import { supabase } from './db';
import { maskPhoneNumber } from './utils';

export interface AuditLogEntry {
  event_type: string;
  event_category: 'registration' | 'payment' | 'payout' | 'referral' | 'admin' | 'security' | 'other';
  actor_user_id?: string;
  actor_role?: string;
  actor_ip_address?: string;
  actor_user_agent?: string;
  entity_type?: string;
  entity_id?: string;
  action: string;
  description: string;
  changes?: Record<string, unknown>;
  status?: 'success' | 'failure' | 'partial';
  error_message?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an audit event to audit_log table
 * Per Ledger §4 and §25 - immutable audit trail
 * POPIA-compliant: masks MSISDN in descriptions
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    // Mask any MSISDN in description or metadata
    let description = entry.description;
    let metadata = entry.metadata || {};

    // Replace raw MSISDN in description with masked version
    const msisdnRegex = /(\+?\d{10,15})/g;
    description = description.replace(msisdnRegex, (match) => maskPhoneNumber(match));

    // Mask MSISDN in metadata
    if (metadata.msisdn) {
      metadata = {
        ...metadata,
        msisdn_masked: maskPhoneNumber(metadata.msisdn as string),
      };
      delete metadata.msisdn;
    }
    if (metadata.phone_number) {
      metadata = {
        ...metadata,
        phone_number_masked: maskPhoneNumber(metadata.phone_number as string),
      };
      delete metadata.phone_number;
    }

    const { error } = await supabase.from('audit_log').insert({
      event_type: entry.event_type,
      event_category: entry.event_category,
      actor_user_id: entry.actor_user_id || null,
      actor_role: entry.actor_role || null,
      actor_ip_address: entry.actor_ip_address || null,
      actor_user_agent: entry.actor_user_agent || null,
      entity_type: entry.entity_type || null,
      entity_id: entry.entity_id || null,
      action: entry.action,
      description: description,
      changes: entry.changes || null,
      status: entry.status || 'success',
      error_message: entry.error_message || null,
      metadata: metadata,
    });

    if (error) {
      // Don't throw - audit logging failures shouldn't break the main flow
      console.error('Failed to log audit event:', error);
    }
  } catch (error) {
    // Silent fail for audit logging
    console.error('Audit logging error:', error);
  }
}





