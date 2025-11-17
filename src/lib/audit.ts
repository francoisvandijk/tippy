// Audit logging utility
// Ledger Reference: §4 (Data Model), §25 (Secrets Management)

import { supabase } from './db';
import { generateRequestId } from './utils';

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
  request_id?: string;
}

/**
 * Log an audit event to audit_log table
 * Per Ledger §4 and §25 - immutable audit trail
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    const requestId = entry.request_id || generateRequestId();
    
    const { error } = await supabase
      .from('audit_log')
      .insert({
        event_type: entry.event_type,
        event_category: entry.event_category,
        actor_user_id: entry.actor_user_id || null,
        actor_role: entry.actor_role || null,
        actor_ip_address: entry.actor_ip_address || null,
        actor_user_agent: entry.actor_user_agent || null,
        entity_type: entry.entity_type || null,
        entity_id: entry.entity_id || null,
        action: entry.action,
        description: entry.description,
        changes: entry.changes || null,
        status: entry.status || 'success',
        error_message: entry.error_message || null,
        metadata: entry.metadata || null,
        request_id: requestId,
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

