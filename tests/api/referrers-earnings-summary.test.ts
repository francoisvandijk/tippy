// Tests for referrer earnings summary endpoint
// Ledger Reference: §7 (API Surface), §10 (Referrals), §2 (Roles & Access)

import { vi , describe, it, expect, beforeEach} from 'vitest';

// Mock Supabase - MUST be before all imports
vi.mock('../../src/lib/db', () => {
  const mockSupabaseFrom = vi.fn();
  return {
    supabase: {
      from: mockSupabaseFrom,
    },
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

import request from 'supertest';

import * as dbModule from '../../src/lib/db';
import app from '../../src/server';

import jwt from 'jsonwebtoken';

// Get the mocked supabase for test-specific mocks
const mockSupabaseFrom = (dbModule.supabase as any).from;

// Helper to create a proper mock chain for Supabase queries
const createSelectChain = (result: { data: any; error: any }) => {
  const eqChain = {
    single: vi.fn(() => Promise.resolve(result)),
    eq: vi.fn(() => ({
      single: vi.fn(() => Promise.resolve(result)),
      order: vi.fn(() => Promise.resolve(result)),
    })),
    order: vi.fn(() => Promise.resolve(result)),
  };

  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => eqChain),
    })),
  };
};

// Test JWT secret (for generating test tokens)
const TEST_JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;

/**
 * Generate a test JWT token
 */
function generateTestToken(userId: string, role: string = 'referrer'): string {
  return jwt.sign(
    {
      sub: userId,
      role: role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    },
    TEST_JWT_SECRET
  );
}

describe('GET /referrers/earnings/summary', () => {
  const referrerId = 'referrer-123';
  const referrerToken = generateTestToken(referrerId, 'referrer');

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseFrom.mockReset();
  });

  describe('Authentication', () => {
    it('should return 401 AUTHZ_DENIED without Authorization header', async () => {
      const response = await request(app).get('/referrers/earnings/summary');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('AUTHZ_DENIED');
    });

    it('should return 401 for invalid token', async () => {
      const response = await request(app)
        .get('/referrers/earnings/summary')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('AUTHZ_DENIED');
    });

    it('should return 403 AUTHZ_DENIED for guard role', async () => {
      const guardToken = generateTestToken('guard-123', 'guard');

      const response = await request(app)
        .get('/referrers/earnings/summary')
        .set('Authorization', `Bearer ${guardToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('AUTHZ_DENIED');
    });

    it('should return 403 AUTHZ_DENIED for guard role', async () => {
      const guardToken = generateTestToken('guard-123', 'guard');

      const response = await request(app)
        .get('/referrers/earnings/summary')
        .set('Authorization', `Bearer ${guardToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('AUTHZ_DENIED');
    });
  });

  describe('Happy Path', () => {
    it('should return earnings summary for referrer with earnings', async () => {
      const mockBalance = {
        referrer_id: referrerId,
        accrued_balance_zar_cents: 2500, // R25.00
        earned_count: 2,
        reversal_count: 0,
        last_event_at: '2024-01-15T10:00:00Z',
      };

      const mockLedgerEntries = [
        {
          event_type: 'EARNED',
          amount_zar_cents: 1500, // R15.00
          balance_after_zar_cents: 1500,
          created_at: '2024-01-10T10:00:00Z',
        },
        {
          event_type: 'EARNED',
          amount_zar_cents: 1000, // R10.00
          balance_after_zar_cents: 2500,
          created_at: '2024-01-15T10:00:00Z',
        },
      ];

      // Mock referral_balances query
      mockSupabaseFrom.mockReturnValueOnce(createSelectChain({ data: mockBalance, error: null }));

      // Mock referral_earnings_ledger query
      const ledgerSelectChain = {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: mockLedgerEntries, error: null })),
          })),
        })),
      };
      mockSupabaseFrom.mockReturnValueOnce(ledgerSelectChain);

      const response = await request(app)
        .get('/referrers/earnings/summary')
        .set('Authorization', `Bearer ${referrerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        total_earnings_zar_cents: 2500,
        available_earnings_zar_cents: 2500,
        pending_reversals_zar_cents: 0,
        breakdown: expect.any(Array),
      });

      expect(response.body.breakdown).toHaveLength(2);
      expect(response.body.breakdown[0]).toMatchObject({
        event_type: 'EARNED',
        amount_zar_cents: 1500,
        balance_after_zar_cents: 1500,
      });
      expect(response.body.breakdown[1]).toMatchObject({
        event_type: 'EARNED',
        amount_zar_cents: 1000,
        balance_after_zar_cents: 2500,
      });
    });

    it('should return zero earnings for referrer with no earnings', async () => {
      // Mock referral_balances query - no rows (PGRST116 error code)
      const noRowsError = {
        code: 'PGRST116',
        message: 'No rows returned',
        details: null,
        hint: null,
      };
      mockSupabaseFrom.mockReturnValueOnce(createSelectChain({ data: null, error: noRowsError }));

      // Mock referral_earnings_ledger query - empty array
      const ledgerSelectChain = {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      };
      mockSupabaseFrom.mockReturnValueOnce(ledgerSelectChain);

      const response = await request(app)
        .get('/referrers/earnings/summary')
        .set('Authorization', `Bearer ${referrerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        total_earnings_zar_cents: 0,
        available_earnings_zar_cents: 0,
        pending_reversals_zar_cents: 0,
        breakdown: [],
      });
    });

    it('should handle reversals correctly', async () => {
      const mockBalance = {
        referrer_id: referrerId,
        accrued_balance_zar_cents: 1000, // R10.00 (after reversal)
        earned_count: 2,
        reversal_count: 1,
        last_event_at: '2024-01-20T10:00:00Z',
      };

      const mockLedgerEntries = [
        {
          event_type: 'REVERSAL',
          amount_zar_cents: 1500, // R15.00 reversal
          balance_after_zar_cents: 1000,
          created_at: '2024-01-20T10:00:00Z',
        },
        {
          event_type: 'EARNED',
          amount_zar_cents: 1500, // R15.00
          balance_after_zar_cents: 1500,
          created_at: '2024-01-10T10:00:00Z',
        },
        {
          event_type: 'EARNED',
          amount_zar_cents: 1000, // R10.00
          balance_after_zar_cents: 2500,
          created_at: '2024-01-15T10:00:00Z',
        },
      ];

      // Mock referral_balances query
      mockSupabaseFrom.mockReturnValueOnce(createSelectChain({ data: mockBalance, error: null }));

      // Mock referral_earnings_ledger query
      const ledgerSelectChain = {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: mockLedgerEntries, error: null })),
          })),
        })),
      };
      mockSupabaseFrom.mockReturnValueOnce(ledgerSelectChain);

      const response = await request(app)
        .get('/referrers/earnings/summary')
        .set('Authorization', `Bearer ${referrerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        total_earnings_zar_cents: 2500, // Total earned before reversals
        available_earnings_zar_cents: 1000, // Net after reversals
        pending_reversals_zar_cents: 0,
        breakdown: expect.any(Array),
      });

      expect(response.body.breakdown).toHaveLength(3);
    });
  });

  describe('Error Handling', () => {
    it('should return 500 PROCESSOR_ERROR on database error fetching balance', async () => {
      const dbError = {
        code: 'DB_ERROR',
        message: 'Database connection failed',
        details: null,
        hint: null,
      };
      mockSupabaseFrom.mockReturnValueOnce(createSelectChain({ data: null, error: dbError }));

      const response = await request(app)
        .get('/referrers/earnings/summary')
        .set('Authorization', `Bearer ${referrerToken}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('PROCESSOR_ERROR');
      expect(response.body.message).toBe('Failed to fetch earnings summary');
    });

    it('should return 500 PROCESSOR_ERROR on database error fetching ledger', async () => {
      const mockBalance = {
        referrer_id: referrerId,
        accrued_balance_zar_cents: 2500,
        earned_count: 2,
        reversal_count: 0,
        last_event_at: '2024-01-15T10:00:00Z',
      };

      // Mock successful balance query
      mockSupabaseFrom.mockReturnValueOnce(createSelectChain({ data: mockBalance, error: null }));

      // Mock failed ledger query
      const dbError = {
        code: 'DB_ERROR',
        message: 'Database connection failed',
        details: null,
        hint: null,
      };
      const ledgerSelectChain = {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: null, error: dbError })),
          })),
        })),
      };
      mockSupabaseFrom.mockReturnValueOnce(ledgerSelectChain);

      const response = await request(app)
        .get('/referrers/earnings/summary')
        .set('Authorization', `Bearer ${referrerToken}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('PROCESSOR_ERROR');
      expect(response.body.message).toBe('Failed to fetch earnings breakdown');
    });
  });
});
