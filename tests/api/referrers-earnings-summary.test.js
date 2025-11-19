'use strict';
// Tests for referrer earnings summary endpoint
// Ledger Reference: §7 (API Surface), §10 (Referrals), §2 (Roles & Access)
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
// Helper to create a proper mock chain for Supabase queries
const createSelectChain = (result) => {
  const eqChain = {
    single: vitest_1.vi.fn(() => Promise.resolve(result)),
    eq: vitest_1.vi.fn(() => ({
      single: vitest_1.vi.fn(() => Promise.resolve(result)),
      order: vitest_1.vi.fn(() => Promise.resolve(result)),
    })),
    order: vitest_1.vi.fn(() => Promise.resolve(result)),
  };
  return {
    select: vitest_1.vi.fn(() => ({
      eq: vitest_1.vi.fn(() => eqChain),
    })),
  };
};
// Test JWT secret (for generating test tokens)
const TEST_JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
/**
 * Generate a test JWT token
 */
function generateTestToken(userId, role = 'referrer') {
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
(0, vitest_2.describe)('GET /referrers/earnings/summary', () => {
  const referrerId = 'referrer-123';
  const referrerToken = generateTestToken(referrerId, 'referrer');
  (0, vitest_2.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
    mockSupabaseFrom.mockReset();
  });
  (0, vitest_2.describe)('Authentication', () => {
    (0, vitest_2.it)('should return 401 AUTHZ_DENIED without Authorization header', async () => {
      const response = await (0, supertest_1.default)(server_1.default).get(
        '/referrers/earnings/summary'
      );
      (0, vitest_2.expect)(response.status).toBe(401);
      (0, vitest_2.expect)(response.body.error).toBe('AUTHZ_DENIED');
    });
    (0, vitest_2.it)('should return 401 for invalid token', async () => {
      const response = await (0, supertest_1.default)(server_1.default)
        .get('/referrers/earnings/summary')
        .set('Authorization', 'Bearer invalid-token');
      (0, vitest_2.expect)(response.status).toBe(401);
      (0, vitest_2.expect)(response.body.error).toBe('AUTHZ_DENIED');
    });
    (0, vitest_2.it)('should return 403 AUTHZ_DENIED for guard role', async () => {
      const guardToken = generateTestToken('guard-123', 'guard');
      const response = await (0, supertest_1.default)(server_1.default)
        .get('/referrers/earnings/summary')
        .set('Authorization', `Bearer ${guardToken}`);
      (0, vitest_2.expect)(response.status).toBe(403);
      (0, vitest_2.expect)(response.body.error).toBe('AUTHZ_DENIED');
    });
    (0, vitest_2.it)('should return 401 AUTHZ_DENIED for invalid user role', async () => {
      // 'user' is not a valid role in the system (valid roles: admin, referrer, guard, internal)
      // When an invalid role is found, auth fails with 401
      const userToken = generateTestToken('user-123', 'user');
      // Mock user role lookup from database - returns invalid 'user' role
      const userSelectChain = {
        select: vitest_1.vi.fn(() => ({
          eq: vitest_1.vi.fn(() => ({
            single: vitest_1.vi.fn(() =>
              Promise.resolve({
                data: { role: 'user' },
                error: null,
              })
            ),
          })),
        })),
      };
      mockSupabaseFrom.mockReturnValueOnce(userSelectChain);
      const response = await (0, supertest_1.default)(server_1.default)
        .get('/referrers/earnings/summary')
        .set('Authorization', `Bearer ${userToken}`);
      // Invalid role causes auth to fail with 401 (not 403, because role validation fails)
      (0, vitest_2.expect)(response.status).toBe(401);
      (0, vitest_2.expect)(response.body.error).toBe('AUTHZ_DENIED');
    });
  });
  (0, vitest_2.describe)('Happy Path', () => {
    (0, vitest_2.it)('should return earnings summary for referrer with earnings', async () => {
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
        select: vitest_1.vi.fn(() => ({
          eq: vitest_1.vi.fn(() => ({
            order: vitest_1.vi.fn(() => Promise.resolve({ data: mockLedgerEntries, error: null })),
          })),
        })),
      };
      mockSupabaseFrom.mockReturnValueOnce(ledgerSelectChain);
      const response = await (0, supertest_1.default)(server_1.default)
        .get('/referrers/earnings/summary')
        .set('Authorization', `Bearer ${referrerToken}`);
      (0, vitest_2.expect)(response.status).toBe(200);
      (0, vitest_2.expect)(response.body).toMatchObject({
        total_earnings_zar_cents: 2500,
        available_earnings_zar_cents: 2500,
        pending_reversals_zar_cents: 0,
        breakdown: vitest_2.expect.any(Array),
      });
      (0, vitest_2.expect)(response.body.breakdown).toHaveLength(2);
      (0, vitest_2.expect)(response.body.breakdown[0]).toMatchObject({
        event_type: 'EARNED',
        amount_zar_cents: 1500,
        balance_after_zar_cents: 1500,
      });
      (0, vitest_2.expect)(response.body.breakdown[1]).toMatchObject({
        event_type: 'EARNED',
        amount_zar_cents: 1000,
        balance_after_zar_cents: 2500,
      });
    });
    (0, vitest_2.it)('should return zero earnings for referrer with no earnings', async () => {
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
        select: vitest_1.vi.fn(() => ({
          eq: vitest_1.vi.fn(() => ({
            order: vitest_1.vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      };
      mockSupabaseFrom.mockReturnValueOnce(ledgerSelectChain);
      const response = await (0, supertest_1.default)(server_1.default)
        .get('/referrers/earnings/summary')
        .set('Authorization', `Bearer ${referrerToken}`);
      (0, vitest_2.expect)(response.status).toBe(200);
      (0, vitest_2.expect)(response.body).toMatchObject({
        total_earnings_zar_cents: 0,
        available_earnings_zar_cents: 0,
        pending_reversals_zar_cents: 0,
        breakdown: [],
      });
    });
    (0, vitest_2.it)('should handle reversals correctly', async () => {
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
        select: vitest_1.vi.fn(() => ({
          eq: vitest_1.vi.fn(() => ({
            order: vitest_1.vi.fn(() => Promise.resolve({ data: mockLedgerEntries, error: null })),
          })),
        })),
      };
      mockSupabaseFrom.mockReturnValueOnce(ledgerSelectChain);
      const response = await (0, supertest_1.default)(server_1.default)
        .get('/referrers/earnings/summary')
        .set('Authorization', `Bearer ${referrerToken}`);
      (0, vitest_2.expect)(response.status).toBe(200);
      (0, vitest_2.expect)(response.body).toMatchObject({
        total_earnings_zar_cents: 2500, // Total earned before reversals
        available_earnings_zar_cents: 1000, // Net after reversals
        pending_reversals_zar_cents: 0,
        breakdown: vitest_2.expect.any(Array),
      });
      (0, vitest_2.expect)(response.body.breakdown).toHaveLength(3);
    });
  });
  (0, vitest_2.describe)('Error Handling', () => {
    (0, vitest_2.it)(
      'should return 500 PROCESSOR_ERROR on database error fetching balance',
      async () => {
        const dbError = {
          code: 'DB_ERROR',
          message: 'Database connection failed',
          details: null,
          hint: null,
        };
        mockSupabaseFrom.mockReturnValueOnce(createSelectChain({ data: null, error: dbError }));
        const response = await (0, supertest_1.default)(server_1.default)
          .get('/referrers/earnings/summary')
          .set('Authorization', `Bearer ${referrerToken}`);
        (0, vitest_2.expect)(response.status).toBe(500);
        (0, vitest_2.expect)(response.body.error).toBe('PROCESSOR_ERROR');
        (0, vitest_2.expect)(response.body.message).toBe('Failed to fetch earnings summary');
      }
    );
    (0, vitest_2.it)(
      'should return 500 PROCESSOR_ERROR on database error fetching ledger',
      async () => {
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
          select: vitest_1.vi.fn(() => ({
            eq: vitest_1.vi.fn(() => ({
              order: vitest_1.vi.fn(() => Promise.resolve({ data: null, error: dbError })),
            })),
          })),
        };
        mockSupabaseFrom.mockReturnValueOnce(ledgerSelectChain);
        const response = await (0, supertest_1.default)(server_1.default)
          .get('/referrers/earnings/summary')
          .set('Authorization', `Bearer ${referrerToken}`);
        (0, vitest_2.expect)(response.status).toBe(500);
        (0, vitest_2.expect)(response.body.error).toBe('PROCESSOR_ERROR');
        (0, vitest_2.expect)(response.body.message).toBe('Failed to fetch earnings breakdown');
      }
    );
  });
});
//# sourceMappingURL=referrers-earnings-summary.test.js.map
